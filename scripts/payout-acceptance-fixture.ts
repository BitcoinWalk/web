/** Synthetic-only acceptance harness: real ledger, worker, recovery and HTTP
 * journal; fake invoices/receipts. Never reads environment or wallet credentials. */
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID,randomBytes} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {encode,sign} from "bolt11";
import {PayoutLedger} from "../src/rustress/payout-ledger";
import {PayoutFlow} from "../src/rustress/payout-flow";
import {RemoteJournalStore} from "../src/rustress/remote-journal-store";
import {createRemoteJournalServer} from "../src/rustress/remote-journal-server";
import {RemoteJournalClient} from "../src/rustress/remote-journal-client";
import {RemoteJournalRecovery} from "../src/rustress/remote-journal-recovery";
import {RUSTRESS_WALLET_REQUIREMENTS} from "../src/rustress/contract";
import type {WalletReadinessEvidence} from "../src/rustress/wallet-readiness";

export const scenarios=["100000","250000","12345000","wallet-restart","lost-journal-ack","outage","stale-fence","missing-history","missing-ledger"] as const;
export async function runPayoutAcceptance(scenario:typeof scenarios[number]){
 const dir=mkdtempSync(join(tmpdir(),"bw-fake-payout-"));
 const journalDb=new DatabaseSync(join(dir,"journal.sqlite"));
 let ledgerDb=new DatabaseSync(join(dir,"ledger.sqlite"));
 const binding=createHash("sha256").update(`isolated-fake-wallet:${randomUUID()}`).digest("hex");
 const token=randomBytes(32).toString("base64url"),operator=randomBytes(32).toString("base64url");
 const store=new RemoteJournalStore(journalDb,binding),initial=store.state();
 store.control(initial.serviceId,initial.fence,"activate");
 const server=createRemoteJournalServer(store,{clientToken:token,operatorToken:operator});
 let listening=false;
 const stop=async()=>{if(!listening)return;listening=false;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));};
 try{
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});listening=true;
  const port=(server.address() as {port:number}).port;
  const transport:typeof fetch=async(url,options)=>{
   const response=await fetch(url,options);
   if(scenario==="lost-journal-ack"&&String(url).endsWith("/claim")){
    assert.equal(response.status,200);await response.arrayBuffer();throw new Error("Synthetic lost acknowledgement");
   }
   return response;
  };
  const client=new RemoteJournalClient(`http://127.0.0.1:${port}`,token,initial.serviceId,binding,transport);
  let ledger=new PayoutLedger(ledgerDb);
  const now=1800000000,amount=/^\d+$/.test(scenario)?scenario:"100000";
  const preimage="12".repeat(32),outgoingPreimage="34".repeat(32);
  const hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
  const outgoingHash=createHash("sha256").update(Buffer.from(outgoingPreimage,"hex")).digest("hex");
  const bucket={cityId:randomUUID(),walletRef:"fake-wallet",destinationVersion:1,destination:"fixture@wallet.example"};
  const policy={binding,budgetMsat:"20000000",maximumPayoutMsat:"15000000",maximumFeeMsat:"10000",expiresAt:now+900};
  const readiness:WalletReadinessEvidence={connectionRef:"fake-wallet",checkoutConnectionRef:"fake-checkout",network:"mainnet",
   inventory:{checkedAt:now,expiresAt:now+900,grantedMethods:[...RUSTRESS_WALLET_REQUIREMENTS.methods],notificationsGranted:true,revoked:false,budgetMsat:20000000,remainingBudgetMsat:20000000,budgetRenewal:"never",isolated:true},
   protocol:{checkedAt:now,advertisedMethods:[...RUSTRESS_WALLET_REQUIREMENTS.methods],successfulReadMethods:["get_info","lookup_invoice","list_transactions"]},
   policy:{approvedAt:now,expiresAt:now+900,expectedNetwork:"mainnet",maximumBudgetMsat:20000000,maximumTestPaymentMsat:15000000,maximumFeeMsat:10000,feeLimitVerified:true,approvedSharedWallet:false}};
  let sends=0,sentAmount="0",lookupAvailable=scenario!=="wallet-restart",complete=true;
  const outgoingHashes:string[]=[];
  const wallet={walletRef:"fake-wallet",binding,network:"bc" as const,
   send:async(input:{paymentHash:string;maximumFeeMsat:string})=>{
    // Ordering assertion: actual durable journal record exists BEFORE fake send.
    assert.ok(store.page().entries.some(e=>e.hash===input.paymentHash));
    assert.equal(input.maximumFeeMsat,"10000");sends++;outgoingHashes.push(input.paymentHash);
    if(scenario==="wallet-restart")throw new Error("Synthetic wallet response lost after settlement");
   },
   lookup:async()=>{
    if(!lookupAvailable)throw new Error("Synthetic lookup outage");
    if(!sends)return {state:"not-found" as const};
    return {state:"paid" as const,walletRef:"fake-wallet",paymentHash:outgoingHash,amountMsat:sentAmount,feeMsat:"1000",preimage:outgoingPreimage};
   }};
  const history=async()=>({binding,complete,outgoingHashes});
  // True ONLY in this fresh local synthetic fixture, not a deployment grant.
  const makeGate=()=>new RemoteJournalRecovery(client,ledger,"fake-wallet",history,wallet.lookup,()=>true);
  let recovery=makeGate();assert.equal((await recovery.reconcile()).state,"reconciled");
  const metadata='[["text/plain","synthetic acceptance only"]]';
  const deps={wallet,reader:{walletRef:"fake-wallet",binding,lookupInvoice:async()=>({type:"incoming",state:"settled",payment_hash:hash,amount:Number(amount),settled_at:now,preimage})},
   evidence:async()=>({binding,readiness}),
   fetchJson:async(url:URL)=>{
    assert.equal(url.hostname,"wallet.example"); // No external fetch performed.
    if(!url.searchParams.has("amount"))return {tag:"payRequest",callback:"https://wallet.example/pay",minSendable:1000,maxSendable:15000000,metadata};
    sentAmount=url.searchParams.get("amount")!;
    return {pr:sign(encode({millisatoshis:sentAmount,timestamp:now,tags:[{tagName:"payment_hash",data:outgoingHash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(metadata).digest("hex")},{tagName:"expire_time",data:3600}]}),"56".repeat(32)).paymentRequest!};
   }};
  let flow=new PayoutFlow(ledger,{...deps,recovery},policy,()=>now);
  flow.register({...bucket,paymentHash:hash,amountMsat:amount});
  await flow.collect(hash);await flow.collect(hash);
  const id=randomUUID();await flow.prepare(hash,id);
  if(scenario==="outage")await stop();
  if(scenario==="stale-fence"){const s=store.state();store.control(s.serviceId,s.fence,"pause");}
  await flow.run(id);await flow.run(id);
  if(["lost-journal-ack","outage","stale-fence"].includes(scenario)){
   assert.equal(sends,0);assert.equal(ledger.status(id)?.state,"unknown");assert.equal(recovery.ready,false);
   assert.equal(ledger.balance(bucket).paidMsat,"0");
   if(scenario==="lost-journal-ack"){
    assert.equal(store.page().entries.length,1);
    const e=store.page().entries[0],s=store.state();
    assert.equal(store.claim({serviceId:s.serviceId,binding,fence:s.fence!,id:e.id,hash:e.hash,commitment:e.commitment}).outcome,"recorded");
   }
   return;
  }
  if(scenario==="wallet-restart"){
   assert.equal(ledger.status(id)?.state,"unknown");assert.equal(sends,1);
   ledgerDb.close();ledgerDb=new DatabaseSync(join(dir,"ledger.sqlite"));ledger=new PayoutLedger(ledgerDb);
   lookupAvailable=true;recovery=makeGate();assert.equal((await recovery.reconcile()).state,"reconciled");
   flow=new PayoutFlow(ledger,{...deps,recovery},policy,()=>now+1000);
   await flow.run(id);assert.equal(sends,1);
  }
  assert.equal(ledger.status(id)?.state,"paid");assert.equal(sends,1);
  const earned=BigInt(amount)*79n/100n,paid=earned/1000n*1000n;
  assert.equal(ledger.balance(bucket).earnedMsat,String(earned));
  assert.equal(ledger.balance(bucket).paidMsat,String(paid));
  assert.equal(ledger.balance(bucket).availableMsat,String(earned-paid));
  assert.equal(ledger.accounting(bucket).retainedAfterPaidFeesMsat,String(BigInt(amount)-earned-1000n));
  if(scenario==="missing-history")complete=false;
  if(scenario==="missing-ledger"){
   ledgerDb.close();ledgerDb=new DatabaseSync(join(dir,"restored-empty.sqlite"));ledger=new PayoutLedger(ledgerDb);
  }
  recovery=makeGate();
  assert.equal((await recovery.reconcile()).state,["missing-history","missing-ledger"].includes(scenario)?"blocked":"reconciled");
  assert.equal(sends,1);
 }finally{
  await stop();if(ledgerDb.isOpen)ledgerDb.close();journalDb.close();rmSync(dir,{recursive:true,force:true});
 }
}
