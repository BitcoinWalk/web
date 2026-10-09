import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {encode,sign} from "bolt11";
import {afterEach,describe,it,expect,vi} from "vitest";
import {PayoutLedger} from "./payout-ledger";
import {PayoutFlow} from "./payout-flow";
import {RUSTRESS_WALLET_REQUIREMENTS} from "./contract";
import type {WalletReadinessEvidence} from "./wallet-readiness";
const now=1800000000,binding="ab".repeat(32),preimage="12".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
const outgoingPreimage="34".repeat(32),outgoingHash=createHash("sha256").update(Buffer.from(outgoingPreimage,"hex")).digest("hex");
const metadata='[["text/plain","fixture"]]';
const dbs:DatabaseSync[]=[],dirs:string[]=[];
afterEach(()=>{for(const db of dbs.splice(0))if(db.isOpen)db.close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true});});
function fixture(path=":memory:",amount="100000"){
 const db=new DatabaseSync(path);dbs.push(db);const ledger=new PayoutLedger(db);
 const bucket={cityId:randomUUID(),walletRef:"fixture",destinationVersion:1,destination:"fixture@wallet.example"};
 const policy={binding,budgetMsat:"10000000",maximumPayoutMsat:"10000000",maximumFeeMsat:"100000",feePolicy:"ldk-native-v1" as const,expiresAt:now+900};
 const readiness:WalletReadinessEvidence={connectionRef:"fixture",checkoutConnectionRef:"checkout",network:"mainnet",
   inventory:{checkedAt:now,expiresAt:now+900,grantedMethods:[...RUSTRESS_WALLET_REQUIREMENTS.methods],notificationsGranted:true,revoked:false,budgetMsat:10000000,remainingBudgetMsat:10000000,budgetRenewal:"never",isolated:true},
  protocol:{checkedAt:now,advertisedMethods:[...RUSTRESS_WALLET_REQUIREMENTS.methods],successfulReadMethods:["get_info","lookup_invoice","list_transactions"]},
   policy:{approvedAt:now,expiresAt:now+900,expectedNetwork:"mainnet",maximumBudgetMsat:10000000,maximumTestPaymentMsat:9900000,maximumFeeMsat:100000,feeLimitVerified:true,approvedSharedWallet:false}};
 let sentAmount="0",time=now;
 const reader={walletRef:"fixture",binding,lookupInvoice:vi.fn(async()=>({type:"incoming",state:"settled",payment_hash:hash,amount:Number(amount),settled_at:now,preimage}))};
 const wallet={walletRef:"fixture",binding,network:"bc" as const,send:vi.fn<(_input:{invoice:string;maximumFeeMsat:string;paymentHash:string})=>Promise<void>>(async()=>{}),lookup:vi.fn(async()=>({state:"paid" as const,walletRef:"fixture",paymentHash:outgoingHash,amountMsat:sentAmount,feeMsat:"1000",preimage:outgoingPreimage}))};
 const fetchJson=vi.fn(async(url:URL)=>{
  if(!url.searchParams.has("amount"))return {tag:"payRequest",callback:"https://wallet.example/pay",minSendable:1000,maxSendable:10000000,metadata};
  sentAmount=url.searchParams.get("amount")!;
  return {pr:sign(encode({millisatoshis:sentAmount,timestamp:now,tags:[{tagName:"payment_hash",data:outgoingHash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(metadata).digest("hex")},{tagName:"expire_time",data:3600}]}),"56".repeat(32)).paymentRequest!};
 });
 // Synthetic fresh-wallet permit; durable restore behavior has separate tests.
 const deps={reader,wallet,fetchJson,evidence:vi.fn(async()=>({binding,readiness})),recovery:{ready:true,claim:vi.fn(()=>true)}};
 const flow=new PayoutFlow(ledger,deps,policy,()=>time);flow.register({...bucket,paymentHash:hash,amountMsat:amount});
 return {db,ledger,bucket,policy,deps,flow,readiness,advance:()=>{time+=1000;}};
}
describe("isolated end-to-end payout flow",()=>{
 it("cannot send without a reconciled recovery guard",async()=>{
  const f=fixture();await f.flow.collect(hash);const id=randomUUID();await f.flow.prepare(hash,id);
  const flow=new PayoutFlow(f.ledger,{...f.deps,recovery:undefined},f.policy,()=>now);
  expect((await flow.run(id))?.state).toBe("prepared");expect(f.deps.wallet.send).not.toHaveBeenCalled();
 });
 it.each(["100000","250000","12345000"])("allocates arbitrary incoming %s msat without a 100-sat product limit",async amount=>{
  const f=fixture(":memory:",amount);await f.flow.collect(hash);await f.flow.collect(hash);
  const id=randomUUID();await f.flow.prepare(hash,id);await f.flow.run(id);await f.flow.run(id);
  const earned=BigInt(amount)*79n/100n,paid=earned/1000n*1000n;
  expect(f.ledger.balance(f.bucket)).toMatchObject({earnedMsat:String(earned),paidMsat:String(paid),availableMsat:String(earned-paid)});
  expect(f.ledger.accounting(f.bucket).retainedAfterPaidFeesMsat).toBe(String(BigInt(amount)-earned-1000n));
  expect(f.deps.wallet.send).toHaveBeenCalledTimes(1);
  const native=(paid+99n)/100n;expect(f.deps.wallet.send.mock.calls[0][0].maximumFeeMsat).toBe(String(native>10000n?native:10000n));
 });
 it.each(["direction","amount","proof","unknown"])("rejects %s incoming evidence without credit",async mode=>{
  const f=fixture();const row=await f.deps.reader.lookupInvoice();
  if(mode==="direction")row.type="outgoing";if(mode==="amount")row.amount++;if(mode==="proof")row.preimage="ab".repeat(32);
  f.deps.reader.lookupInvoice.mockResolvedValue(row);
  await expect(f.flow.collect(mode==="unknown"?"ab".repeat(32):hash)).rejects.toThrow("could not be verified");
  expect(f.ledger.balance(f.bucket).earnedMsat).toBe("0");
 });
 it("retains small obligations until recipient minimum is met",async()=>{
  const f=fixture(":memory:","1000");await f.flow.collect(hash);
  await expect(f.flow.prepare(hash,randomUUID())).rejects.toThrow("obligation retained");expect(f.ledger.balance(f.bucket).availableMsat).toBe("790");
  expect(f.deps.fetchJson).toHaveBeenCalledTimes(1);expect(f.deps.wallet.send).not.toHaveBeenCalled();
 });
 it("reuses a saved invoice without refetching on preparation retry",async()=>{
  const f=fixture();await f.flow.collect(hash);const id=randomUUID();await f.flow.prepare(hash,id);await f.flow.prepare(hash,id);
  expect(f.deps.fetchJson).toHaveBeenCalledTimes(2);
 });
 it("recovers missed notifications with bounded scans and retries failed rows",async()=>{
  const f=fixture();f.deps.reader.lookupInvoice.mockRejectedValueOnce(new Error("private"));
  expect(await f.flow.sweep(0,1)).toMatchObject({failed:1,credited:0,done:false});
  expect(await f.flow.sweep(0,1)).toMatchObject({failed:0,credited:1});
  expect(await f.flow.sweep()).toMatchObject({done:true,credited:0});
  expect(f.ledger.balance(f.bucket).earnedMsat).toBe("79000");
 });
 it("caps a payout at recipient maximum without losing remaining obligations",async()=>{
  const f=fixture();await f.flow.collect(hash);
  f.deps.fetchJson.mockResolvedValueOnce({tag:"payRequest",callback:"https://wallet.example/pay",minSendable:1000,maxSendable:50000,metadata});
  const id=randomUUID();await f.flow.prepare(hash,id);await f.flow.run(id);
  expect(f.ledger.balance(f.bucket)).toMatchObject({paidMsat:"50000",availableMsat:"29000"});
 });
 it("does not replace the saved destination or lose debt during an endpoint outage",async()=>{
  const f=fixture();await f.flow.collect(hash);
  expect(()=>f.flow.register({...f.bucket,destination:"attacker@wallet.example",paymentHash:hash,amountMsat:"100000"})).toThrow();
  f.deps.fetchJson.mockRejectedValueOnce(new Error("private"));
  await expect(f.flow.prepare(hash,randomUUID())).rejects.toThrow(/^Payout preparation unavailable; obligation retained$/);
  expect(f.ledger.balance(f.bucket).availableMsat).toBe("79000");
 });
 it.each(["revoked","fee","binding","expired"])("blocks %s authorization without sending",async mode=>{
  const f=fixture();await f.flow.collect(hash);const id=randomUUID();await f.flow.prepare(hash,id);
  if(mode==="revoked")f.readiness.inventory.revoked=true;if(mode==="fee")f.readiness.policy.feeLimitVerified=false;
  if(mode==="binding")f.deps.evidence.mockResolvedValue({binding:"cd".repeat(32),readiness:f.readiness});if(mode==="expired")f.advance();
  expect((await f.flow.run(id))?.state).toBe("prepared");expect(f.deps.wallet.send).not.toHaveBeenCalled();
 });
 it("reconciles after process restart without a second send, even after policy expiry",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"bw-flow-"));dirs.push(dir);const path=join(dir,"test.sqlite"),f=fixture(path);
  await f.flow.collect(hash);const id=randomUUID();await f.flow.prepare(hash,id);
  f.deps.wallet.lookup.mockRejectedValueOnce(new Error("private"));await f.flow.run(id);f.db.close();
  const db=new DatabaseSync(path);dbs.push(db);const ledger=new PayoutLedger(db),flow=new PayoutFlow(ledger,f.deps,f.policy,()=>now+1000);
  expect((await flow.run(id))?.state).toBe("paid");expect(f.deps.wallet.send).toHaveBeenCalledTimes(1);
  expect(()=>new PayoutFlow(ledger,{...f.deps,reader:{...f.deps.reader,binding:"cd".repeat(32)},wallet:{...f.deps.wallet,binding:"cd".repeat(32)}},{...f.policy,binding:"cd".repeat(32)})).toThrow("binding conflict");
 });
 it("serializes wallet-wide budget claims across cities and retains unknown reservations",()=>{
  const f=fixture();f.ledger.settle("fixture",hash,"100000");
  const other={...f.bucket,cityId:randomUUID()};f.ledger.register({...other,paymentHash:"ef".repeat(32),amountMsat:"100000"});f.ledger.settle("fixture","ef".repeat(32),"100000");
  const a=randomUUID(),b=randomUUID();f.ledger.reserve(f.bucket,a,outgoingHash,"79000","10000");f.ledger.reserve(other,b,"aa".repeat(32),"79000","10000");
  expect(f.ledger.claimWithinBudget(a,"fixture","100000")).toBe(true);expect(f.ledger.claimWithinBudget(b,"fixture","100000")).toBe(false);
  expect(f.ledger.status(b)?.state).toBe("prepared");
 });
});
