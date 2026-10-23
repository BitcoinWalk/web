import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {encode,sign} from "bolt11";
import {afterEach,describe,expect,it,vi} from "vitest";
import {SponsorPayoutRuntime,type SponsorPayoutRuntimeDependencies} from "./sponsor-payout-runtime";
import {SponsorPayoutStore} from "./sponsor-payout-sender";
import {SponsorService} from "./sponsor-service";
import {SponsorInvitationStore} from "./sponsor-invitation-store";
import {PayoutDestinationStore} from "./payout-destination-store";
import {sponsorDestinationFingerprint} from "./sponsor-payout-order";
import {SPONSOR_PAYOUT_OPERATION_CONTRACT} from "./sponsor-payout-operation";
import type {SponsorWalletReadinessEvidence} from "./sponsor-wallet-readiness";
import {RemoteJournalStore} from "../rustress/remote-journal-store";
import {validateOutgoingInvoice} from "../rustress/outgoing-invoice";
import {HUB_PAYMENT_SAFETY_CONTRACT,HUB_PAYMENT_SAFETY_CANDIDATE,HUB_PAYMENT_SAFETY_UPSTREAM} from "../rustress/hub-capability";
import type {PayoutWallet} from "../rustress/payout-worker";

const time=1_800_000_000,adminKey=Buffer.from("15".repeat(32),"hex"),hostKey=Buffer.from("16".repeat(32),"hex"),host=getPublicKey(hostKey),admin=getPublicKey(adminKey);
const cityId="30000000-0000-4000-8000-000000000001",orderId="10000000-0000-4000-8000-000000000001",invitationId="20000000-0000-4000-8000-000000000001",binding="ab".repeat(32),walletRef="bitcoinwalk-sponsor-payout",sourceHash="cd".repeat(32);
const preimage="12".repeat(32),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
const dbs:DatabaseSync[]=[],directories:string[]=[];afterEach(()=>{for(const db of dbs.splice(0))db.close();for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});

function fixture(persistent=false){
 let now=time,enabled=true,historyComplete=true,settled=false;
 const directory=persistent?mkdtempSync(join(tmpdir(),"sponsor-runtime-test-")):null;if(directory)directories.push(directory);
 const databasePath=directory?join(directory,"staging.sqlite"):"\u003amemory:";
 const db=new DatabaseSync(databasePath),remote=new DatabaseSync(":memory:");dbs.push(db,remote);
 const unused=async()=>{throw new Error("checkout must not be called");};new SponsorService(db,{makeSponsorInvoice:unused,lookupInvoice:unused},async()=>[]);
 const invitations=new SponsorInvitationStore(db,()=>time-100),token="ef".repeat(32);
 const invitationEvent=finalizeEvent({kind:27235,created_at:time-100,tags:[],content:JSON.stringify({action:"create",id:invitationId,cityId,walkId:null,tokenHash:createHash("sha256").update(token).digest("hex"),expiresAt:time+86400})},hostKey);
 invitations.create({id:invitationId,token,cityId,cityName:"Fixture",hostPubkey:host,payoutVersion:1,expiresAt:time+86400,authorizationEvent:JSON.stringify(invitationEvent)});
 db.prepare("INSERT INTO sponsorship_order(id,tokenHash,clientHash,cityId,cityName,count,amountMsat,walks,status,paymentHash,createdAt,settledAt,invitationId,invitationOrigin,hostPubkey,payoutVersion,hostBasisPoints,retainedBasisPoints) VALUES(?,?,?,?,?,1,21000000,'[]','paid',?,?,?,?,'host',?,1,7900,2100)").run(orderId,"token","client",cityId,"Fixture",sourceHash,time-90,time-80,invitationId,host);
 db.prepare("INSERT INTO sponsorship_host_obligation VALUES(?,?,?,?,?, ?,?,?,'owed')").run(orderId,invitationId,cityId,host,1,"21000000","16590000","4410000");
 new PayoutDestinationStore(db);
 const destination={cityId,version:1,ownerPubkey:host,normalized:"host@example.org",endpoint:"https://example.org/.well-known/lnurlp/host",callback:"https://example.org/pay",minSendable:1000,maxSendable:20000000,confirmedAt:time-200};
 const ownerEvent=finalizeEvent({kind:27235,created_at:time-200,tags:[],content:JSON.stringify({action:"save-payout",cityId,destination:destination.normalized})},hostKey);
 db.prepare("INSERT INTO payout_destination_version VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(cityId,1,host,destination.normalized,destination.endpoint,destination.callback,1000,20000000,"{}",ownerEvent.id,JSON.stringify(ownerEvent),time-200);
 const store=new SponsorPayoutStore(db,()=>now),journal=new RemoteJournalStore(remote,binding),initial=journal.state();journal.control(initial.serviceId,initial.fence,"activate");
 const expected={admin,release:"0.1.2",binding,walletRef,journalServiceId:initial.serviceId,budgetMsat:"20000000",maximumPayoutMsat:"16590000",maximumFeeMsat:"165900",cityIds:[cityId],order:{orderId,paymentHash:sourceHash,receivedMsat:"21000000",hostPubkey:host,payoutVersion:1,destinationFingerprint:sponsorDestinationFingerprint(destination)}};
 const operation=finalizeEvent({kind:30312,created_at:time-60,tags:[["d","bitcoinwalk-sponsor-payout-operation"],["expiration",String(time+300)]],content:JSON.stringify({contract:SPONSOR_PAYOUT_OPERATION_CONTRACT,mode:"continuous",...Object.fromEntries(Object.entries(expected).filter(([key])=>key!=="admin")),notBefore:time-60,expiresAt:time+300,nonce:"40000000-0000-4000-8000-000000000001"})},adminKey);
 const readiness:SponsorWalletReadinessEvidence={connectionRef:walletRef,checkoutConnectionRef:"checkout",zapConnectionRef:"zaps",network:"mainnet",inventory:{checkedAt:time,expiresAt:time+300,grantedMethods:["get_info","lookup_invoice","list_transactions","pay_invoice"],revoked:false,budgetMsat:20000000,remainingBudgetMsat:20000000,budgetRenewal:"never",isolated:true},protocol:{checkedAt:time,advertisedMethods:["get_info","lookup_invoice","list_transactions","pay_invoice"],successfulReadMethods:["get_info","lookup_invoice","list_transactions"]},policy:{approvedAt:time,expiresAt:time+300,expectedNetwork:"mainnet",maximumBudgetMsat:20000000,maximumPayoutMsat:16590000,maximumFeeMsat:165900,feeLimitVerified:true}};
 const info={network:"mainnet",methods:readiness.protocol.advertisedMethods,bitcoinwalk_payment_safety:{contract:HUB_PAYMENT_SAFETY_CONTRACT,candidate_revision:HUB_PAYMENT_SAFETY_CANDIDATE,upstream_commit:HUB_PAYMENT_SAFETY_UPSTREAM,backend:"ldk",explicit_fee_ceiling:true,unknown_outcome_reservation:true,outgoing_lookup_reconciliation:true,legacy_failed_quarantine:true}};
 const reader={binding,getInfo:vi.fn(async()=>info),listRecoveryTransactions:vi.fn(async()=>({total_count:historyComplete?(settled?1:0):2,transactions:settled?[{type:"outgoing",payment_hash:paymentHash,state:"settled",amount:16590000,created_at:time,settled_at:time,fees_paid:1000}]:[]}))};
 const paid={state:"paid" as const,walletRef,paymentHash,amountMsat:"16590000",feeMsat:"1000",preimage};
 const wallet={binding,walletRef,network:"bc" as const,send:vi.fn(async()=>{settled=true;}),lookup:vi.fn<PayoutWallet["lookup"]>(async()=>paid)};
 const client={binding,serviceId:initial.serviceId,status:async()=>journal.state(),page:async(after=0)=>journal.page(after),claim:async(input:Parameters<RemoteJournalStore["claim"]>[0])=>journal.claim(input)};
 const terms={amountMsat:"16590000",minMsat:"1000",maxMsat:"20000000",network:"bc" as const,metadata:'[["text/plain","sponsor"]]'};
 const invoice=sign(encode({satoshis:16590,timestamp:time,tags:[{tagName:"payment_hash",data:paymentHash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(terms.metadata).digest("hex")},{tagName:"expire_time",data:3600}]}),"56".repeat(32)).paymentRequest!;
 const retrieve=vi.fn(async()=>validateOutgoingInvoice(invoice,terms,now));
 const connect=vi.fn<SponsorPayoutRuntimeDependencies["connect"]>(async(permit,active)=>({reader,journal:client,wallet:{...wallet,send:async input=>{
  if(!active()||!await permit({binding,paymentHash:input.paymentHash,amountMsat:"16590000",maximumFeeMsat:input.maximumFeeMsat}))throw new Error("permit refused");
  return wallet.send();
 }}}));
 const deps={store,expected,operation:()=>operation,evidence:async()=>({binding,readiness}),deployment:async()=>({binding,serviceId:initial.serviceId,checkedAt:time,expiresAt:time+60,privateTransport:true as const,separateHost:true as const,backupRestoreVerified:true as const,exclusiveSender:true as const}),coverage:async()=>({binding,fenceId:journal.state().fence!,connectionStartedAt:time-1000,retainedFrom:time-1000,checkedAt:time,expiresAt:time+60,exclusive:true as const,sendersStopped:true as const,acceptedPriorSpends:[]}),connect,retrieve};
 const runtime=new SponsorPayoutRuntime(deps,()=>enabled,()=>now);
 return {db,store,journal,wallet,reader,retrieve,readiness,deps,runtime,advance:()=>{now+=61;},disable:()=>{enabled=false;},incomplete:()=>{historyComplete=false;},restart:()=>new SponsorPayoutRuntime(deps,()=>enabled,()=>now),reopen:()=>{
  if(!directory)throw new Error("Persistent fixture required");db.close();dbs.splice(dbs.indexOf(db),1);const opened=new DatabaseSync(databasePath);dbs.push(opened);deps.store=new SponsorPayoutStore(opened,()=>now);return new SponsorPayoutRuntime(deps,()=>enabled,()=>now);
 }};
}

describe("single-order sponsorship sender integration",()=>{
 it("is disabled by default without touching the wallet",async()=>{const f=fixture();expect(await new SponsorPayoutRuntime(f.deps).execute(true)).toMatchObject({state:"blocked",blockedAt:"approval"});expect(f.deps.connect).not.toHaveBeenCalled();});
 it("refuses concurrent execution",async()=>{const f=fixture();const first=f.runtime.execute();expect(await f.runtime.execute(true)).toEqual({state:"busy"});expect(await first).toMatchObject({state:"ready"});expect(f.wallet.send).not.toHaveBeenCalled();});
 it("preflights real recovery without retrieving an invoice or claiming a send",async()=>{const f=fixture();expect(await f.runtime.execute()).toMatchObject({state:"ready",paymentSent:false});expect(f.wallet.send).not.toHaveBeenCalled();expect(f.retrieve).not.toHaveBeenCalled();expect(f.journal.page().entries).toHaveLength(0);});
 it("pays the pinned obligation once and recovers on a new runtime",async()=>{const f=fixture();expect(await f.runtime.execute(true)).toMatchObject({state:"paid",status:{amountMsat:"16590000",feeMsat:"1000"}});expect(await f.restart().execute(true)).toMatchObject({state:"paid"});expect(f.wallet.send).toHaveBeenCalledTimes(1);expect(f.journal.page().entries).toHaveLength(1);});
 it("keeps a lost response unknown until complete restart reconciliation",async()=>{const f=fixture();f.wallet.lookup.mockRejectedValueOnce(new Error("lost lookup"));expect(await f.runtime.execute(true)).toMatchObject({state:"blocked",status:{state:"unknown"}});expect(await f.restart().execute(true)).toMatchObject({state:"paid"});expect(f.wallet.send).toHaveBeenCalledTimes(1);});
 it("reopens the durable database after an ambiguous send and never sends twice",async()=>{const f=fixture(true);f.wallet.lookup.mockRejectedValueOnce(new Error("lost lookup"));expect(await f.runtime.execute(true)).toMatchObject({status:{state:"unknown"}});expect(await f.reopen().execute(true)).toMatchObject({state:"paid"});expect(f.wallet.send).toHaveBeenCalledTimes(1);expect(f.journal.page().entries).toHaveLength(1);});
 it.each(["unpaid","platform","destination","scope","unsigned","revoked","stale","history","hub"])("blocks %s before recipient invoice or wallet send",async reason=>{const f=fixture();
  if(reason==="unpaid")f.db.exec("UPDATE sponsorship_order SET status='pending'");
  if(reason==="platform")f.db.exec("UPDATE sponsorship_order SET invitationOrigin='platform'");
  if(reason==="destination")f.db.exec("UPDATE payout_destination_version SET normalized='other@example.org'");
  if(reason==="scope")f.deps.expected.order.orderId="50000000-0000-4000-8000-000000000001";
  if(reason==="unsigned"){const original=f.deps.operation();f.deps.operation=()=>({...original,sig:"00".repeat(64)});}
  if(reason==="revoked")f.disable();if(reason==="stale")f.advance();if(reason==="history")f.incomplete();
  if(reason==="hub")f.reader.getInfo.mockRejectedValue(new Error("no authenticated capability"));
  expect(await f.runtime.execute(true)).toMatchObject({state:"blocked"});expect(f.retrieve).not.toHaveBeenCalled();expect(f.wallet.send).not.toHaveBeenCalled();
 });
 it("pauses in-flight preparation before a send",async()=>{const f=fixture();const original=f.retrieve.getMockImplementation()!;f.retrieve.mockImplementation(async()=>{f.runtime.pause();return original();});expect(await f.runtime.execute(true)).toMatchObject({state:"blocked"});expect(f.wallet.send).not.toHaveBeenCalled();});
 it("refuses a stale deployment after remote invoice retrieval",async()=>{const f=fixture();const original=f.retrieve.getMockImplementation()!;f.retrieve.mockImplementation(async()=>{const invoice=await original();f.advance();return invoice;});expect(await f.runtime.execute(true)).toMatchObject({state:"blocked"});expect(f.wallet.send).not.toHaveBeenCalled();});
 it("does not cancel an accepted obligation when its invitation is later revoked",async()=>{const f=fixture();f.db.prepare("UPDATE sponsorship_invitation SET revokedAt=?").run(time-1);expect(await f.runtime.execute(true)).toMatchObject({state:"paid"});});
});
