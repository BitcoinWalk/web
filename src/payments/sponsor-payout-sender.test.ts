import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {encode,sign} from "bolt11";
import {afterEach,describe,expect,it,vi} from "vitest";
import type {PayoutDestinationVersion} from "./payout-destination-store";
import {SponsorPayoutSender,SponsorPayoutStore} from "./sponsor-payout-sender";
import {validateOutgoingInvoice,type OutgoingTerms} from "../rustress/outgoing-invoice";
import type {PayoutWallet} from "../rustress/payout-worker";

const time=1_800_000_000,orderId="10000000-0000-4000-8000-000000000001",invitationId="20000000-0000-4000-8000-000000000001",cityId="30000000-0000-4000-8000-000000000001",host="34".repeat(32);
const received="42000000",hostMsat="33180000",retained="8820000",preimage="12".repeat(32),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
const terms:OutgoingTerms={amountMsat:hostMsat,minMsat:"1000",maxMsat:"50000000",network:"bc",metadata:'[["text/plain","host payout"]]'};
const makeInvoice=(timestamp=time,hash=paymentHash)=>sign(encode({satoshis:Number(BigInt(hostMsat)/1000n),timestamp,tags:[{tagName:"payment_hash",data:hash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(terms.metadata).digest("hex")},{tagName:"expire_time",data:3600}]}),"56".repeat(32)).paymentRequest!;
const dbs:DatabaseSync[]=[],dirs:string[]=[];
afterEach(()=>{dbs.splice(0).forEach(db=>{if(db.isOpen)db.close();});dirs.splice(0).forEach(path=>rmSync(path,{recursive:true}));});

function open(path=":memory:"){
 const db=new DatabaseSync(path);dbs.push(db);db.exec(`CREATE TABLE IF NOT EXISTS sponsorship_host_obligation(orderId TEXT PRIMARY KEY,invitationId TEXT NOT NULL,cityId TEXT NOT NULL,hostPubkey TEXT NOT NULL,payoutVersion INTEGER NOT NULL,receivedMsat TEXT NOT NULL,hostMsat TEXT NOT NULL,retainedMsat TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('owed','paid','unknown')));`);
 return db;
}
function fixture(path=":memory:"){
 const db=open(path);db.prepare("INSERT OR IGNORE INTO sponsorship_host_obligation VALUES(?,?,?,?,?,?,?,?, 'owed')").run(orderId,invitationId,cityId,host,3,received,hostMsat,retained);
 let now=time;const store=new SponsorPayoutStore(db,()=>now),destination:PayoutDestinationVersion={cityId,version:3,ownerPubkey:host,normalized:"host@example.org",endpoint:"https://example.org/.well-known/lnurlp/host",callback:"https://example.org/callback",minSendable:1000,maxSendable:50000000,confirmedAt:time-100};
 const destinations={version:vi.fn(()=>destination)},checked=()=>validateOutgoingInvoice(makeInvoice(now),terms,now);
 const retrieve=vi.fn(async()=>checked()),authorize=vi.fn(async()=>true);
 const paid={state:"paid" as const,walletRef:"sponsor-wallet",paymentHash,amountMsat:hostMsat,feeMsat:"1000",preimage};
 const wallet={walletRef:"sponsor-wallet",network:"bc" as const,send:vi.fn(async()=>{}),lookup:vi.fn<PayoutWallet["lookup"]>(async()=>paid)};
 const sender=new SponsorPayoutSender(store,destinations,wallet,authorize,()=>"5000",{now:()=>now,retrieve});
 return {db,store,destination,destinations,retrieve,authorize,wallet,sender,paid,setNow:(value:number)=>{now=value;}};
}

describe("sponsorship host payout sender",()=>{
 it("pays the immutable 79% obligation once using its exact destination version",async()=>{
  const f=fixture();expect(await f.sender.process(orderId)).toMatchObject({state:"paid",amountMsat:hostMsat,feeMsat:"1000"});
  await f.sender.process(orderId);
  expect(f.destinations.version).toHaveBeenCalledWith(cityId,3);expect(f.retrieve).toHaveBeenCalledWith("host@example.org",hostMsat,"bc");
  expect(f.wallet.send).toHaveBeenCalledTimes(1);expect(f.wallet.send).toHaveBeenCalledWith(expect.objectContaining({paymentHash,maximumFeeMsat:"5000"}));
  expect(f.authorize).toHaveBeenCalledTimes(2);expect(f.db.prepare("SELECT state FROM sponsorship_host_obligation WHERE orderId=?").get(orderId)).toEqual({state:"paid"});
 });
 it("does not fetch an invoice or send without fresh authorization",async()=>{
  const f=fixture();f.authorize.mockResolvedValue(false);expect(await f.sender.process(orderId)).toMatchObject({state:"owed",attemptState:null});
  expect(f.retrieve).not.toHaveBeenCalled();expect(f.wallet.send).not.toHaveBeenCalled();
 });
 it("commits unknown before send and reconciles an ambiguous response without resending",async()=>{
  const f=fixture();f.wallet.send.mockImplementationOnce(async()=>{expect(f.store.status(orderId)?.state).toBe("unknown");throw new Error("private wallet error");});
  f.wallet.lookup.mockResolvedValueOnce({state:"pending"});expect(await f.sender.process(orderId)).toMatchObject({state:"unknown",attemptState:"unknown"});
  expect(await f.sender.process(orderId)).toMatchObject({state:"paid"});expect(f.wallet.send).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(f.db.prepare("SELECT * FROM sponsorship_host_payout_attempt").all())).not.toContain("private wallet error");
 });
 it("recovers an unknown attempt after reopening SQLite and never authorizes a second send",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"bw-sponsor-payout-"));dirs.push(dir);const path=join(dir,"fixture.sqlite"),f=fixture(path);
  f.wallet.lookup.mockResolvedValueOnce({state:"not-found"});await f.sender.process(orderId);f.db.close();
  const db=open(path),store=new SponsorPayoutStore(db,()=>time+7200),authorize=vi.fn(async()=>false);
  const sender=new SponsorPayoutSender(store,{version:()=>f.destination},f.wallet,authorize,()=>"5000",{now:()=>time+7200,retrieve:f.retrieve});
  expect(await sender.process(orderId)).toMatchObject({state:"paid"});expect(f.wallet.send).toHaveBeenCalledTimes(1);expect(authorize).not.toHaveBeenCalled();
 });
 it("keeps mismatched wallet evidence unknown and reports an excessive paid fee without retrying",async()=>{
  const f=fixture();f.wallet.lookup.mockResolvedValueOnce({...f.paid,amountMsat:"33179000"});expect(await f.sender.process(orderId)).toMatchObject({state:"unknown"});
  f.wallet.lookup.mockResolvedValueOnce({...f.paid,feeMsat:"5001"});expect(await f.sender.process(orderId)).toMatchObject({state:"paid",feeLimitExceeded:true});expect(f.wallet.send).toHaveBeenCalledTimes(1);
 });
 it("refuses a destination owned by another key and a fee cap larger than BitcoinWalk's retained share",async()=>{
  const wrong=fixture();wrong.destination.ownerPubkey="78".repeat(32);expect(await wrong.sender.process(orderId)).toMatchObject({state:"owed",attemptState:null});expect(wrong.retrieve).not.toHaveBeenCalled();
  const excessive=fixture();const sender=new SponsorPayoutSender(excessive.store,excessive.destinations,excessive.wallet,excessive.authorize,()=>"8820001",{now:()=>time,retrieve:excessive.retrieve});
  expect(await sender.process(orderId)).toMatchObject({state:"owed",attemptState:null});expect(excessive.retrieve).not.toHaveBeenCalled();
 });
 it("lets competing workers claim one send at most",async()=>{
  const f=fixture();const other=new SponsorPayoutSender(f.store,f.destinations,f.wallet,f.authorize,()=>"5000",{now:()=>time,retrieve:f.retrieve});
  await Promise.all([f.sender.process(orderId),other.process(orderId)]);expect(f.wallet.send).toHaveBeenCalledTimes(1);expect(f.store.status(orderId)?.state).toBe("paid");
 });
 it("atomically reserves the lifetime budget including the full fee cap for unknown sends",()=>{
  const f=fixture(),secondOrder="10000000-0000-4000-8000-000000000002",secondInvitation="20000000-0000-4000-8000-000000000002",secondPreimage="13".repeat(32),secondHash=createHash("sha256").update(Buffer.from(secondPreimage,"hex")).digest("hex");
  f.db.prepare("INSERT INTO sponsorship_host_obligation VALUES(?,?,?,?,?,?,?,?, 'owed')").run(secondOrder,secondInvitation,cityId,host,3,received,hostMsat,retained);
  const first=validateOutgoingInvoice(makeInvoice(),terms,time),second=validateOutgoingInvoice(makeInvoice(time,secondHash),terms,time),fingerprint="ab".repeat(32);
  const a=f.store.reserve({id:"40000000-0000-4000-8000-000000000001",orderId,walletRef:"sponsor-wallet",destinationFingerprint:fingerprint,paymentHash:first.paymentHash,amountMsat:hostMsat,feeCapMsat:"5000",expiresAt:first.expiresAt,invoice:first.paymentRequest,terms:first.terms});
  const b=f.store.reserve({id:"40000000-0000-4000-8000-000000000002",orderId:secondOrder,walletRef:"sponsor-wallet",destinationFingerprint:fingerprint,paymentHash:second.paymentHash,amountMsat:hostMsat,feeCapMsat:"5000",expiresAt:second.expiresAt,invoice:second.paymentRequest,terms:second.terms});
  expect(f.store.claimWithinBudget(a.id,"sponsor-wallet","33185000")).toBe(true);expect(f.store.claimWithinBudget(b.id,"sponsor-wallet","33185000")).toBe(false);
  expect(f.store.budgetUsage("sponsor-wallet")).toEqual({usedMsat:"33185000",uncertain:1});expect(f.store.status(secondOrder)).toMatchObject({state:"owed",attemptState:"prepared"});
 });
 it("rejects corrupt obligation arithmetic before any wallet work",async()=>{
  const f=fixture();f.db.prepare("UPDATE sponsorship_host_obligation SET hostMsat='33000000'").run();expect(await f.sender.process(orderId)).toBeNull();expect(f.retrieve).not.toHaveBeenCalled();expect(f.wallet.send).not.toHaveBeenCalled();
 });
});
