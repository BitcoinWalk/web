import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {encode,sign} from "bolt11";
import {afterEach,describe,expect,it,vi} from "vitest";
import {PayoutLedger,type PayoutBucket} from "./payout-ledger";
import {PayoutWorker,type PayoutWallet} from "./payout-worker";
import type {OutgoingTerms} from "./outgoing-invoice";
const bucket:PayoutBucket={cityId:"ca20993a-5b7f-443e-931e-8dbaa61d05fe",walletRef:"fixture",destinationVersion:1,destination:"test@example.org"};
const preimage="12".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex"),time=1800000000;
const terms:OutgoingTerms={amountMsat:"79000",minMsat:"1000",maxMsat:"100000",network:"bc",metadata:'[["text/plain","fixture"]]'};
const invoice=sign(encode({satoshis:79,timestamp:time,tags:[{tagName:"payment_hash",data:hash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(terms.metadata).digest("hex")},{tagName:"expire_time",data:3600}]}),"34".repeat(32)).paymentRequest!;
const dbs:DatabaseSync[]=[],dirs:string[]=[];
afterEach(()=>{dbs.splice(0).forEach(db=>{if(db.isOpen)db.close();});dirs.splice(0).forEach(path=>rmSync(path,{recursive:true}));});
function fixture(path=":memory:"){
 const db=new DatabaseSync(path);dbs.push(db);const ledger=new PayoutLedger(db);let now=time;
 ledger.register({...bucket,paymentHash:"a".repeat(64),amountMsat:"100000"});ledger.settle(bucket.walletRef,"a".repeat(64),"100000");
 const paid={state:"paid" as const,walletRef:bucket.walletRef,paymentHash:hash,amountMsat:"79000",feeMsat:"100",preimage};
 const wallet={walletRef:bucket.walletRef,network:"bc" as const,send:vi.fn(async()=>{}),lookup:vi.fn<PayoutWallet["lookup"]>(async()=>paid)};
 const authorize=vi.fn(async()=>true),worker=new PayoutWorker(ledger,wallet,authorize,()=>now),id=randomUUID();
 return {db,ledger,wallet,authorize,worker,id,paid,advance:()=>{now+=4000;},prepare:()=>worker.prepare(bucket,id,invoice,terms,"1000")};
}
describe("private payout worker with synthetic wallet",()=>{
 it("persists the exact invoice with allocations, claims once and independently looks up settlement",async()=>{
  const f=fixture();f.prepare();f.prepare();
  expect(JSON.parse(f.ledger.workerInput(f.id)!.document!).invoice).toBe(invoice);
  f.wallet.send.mockImplementationOnce(async()=>{expect(f.ledger.status(f.id)?.state).toBe("unknown");});
  expect((await f.worker.run(f.id))?.state).toBe("paid");await f.worker.run(f.id);
  expect(f.wallet.send).toHaveBeenCalledTimes(1);expect(f.wallet.lookup).toHaveBeenCalledTimes(1);
  expect(f.wallet.send).toHaveBeenCalledWith({invoice,maximumFeeMsat:"1000",paymentHash:hash});
 });
 it("does not reserve an invalid invoice or a different wallet",()=>{
  const f=fixture();expect(()=>f.worker.prepare(bucket,f.id,"invalid",terms,"1000")).toThrow();
  expect(()=>f.worker.prepare({...bucket,walletRef:"other"},f.id,invoice,terms,"1000")).toThrow("wallet mismatch");
  expect(f.ledger.balance(bucket).reservedMsat).toBe("0");
 });
 it("requires fresh authorization and rechecks expiry after waiting for it",async()=>{
  const f=fixture();f.prepare();f.authorize.mockResolvedValueOnce(false);await f.worker.run(f.id);expect(f.wallet.send).not.toHaveBeenCalled();
  f.authorize.mockImplementationOnce(async()=>{f.advance();return true;});await f.worker.run(f.id);
  expect(f.wallet.send).not.toHaveBeenCalled();expect(f.ledger.status(f.id)?.state).toBe("prepared");
 });
 it("lost send responses reconcile by lookup without a second send",async()=>{
  const f=fixture();f.prepare();f.wallet.send.mockRejectedValueOnce(new Error("SECRET"));
  f.wallet.lookup.mockResolvedValueOnce({state:"pending"});expect((await f.worker.run(f.id))?.state).toBe("unknown");
  expect((await f.worker.run(f.id))?.state).toBe("paid");expect(f.wallet.send).toHaveBeenCalledTimes(1);
 });
 it.each(["not-found","failed","pending"] as const)("does not treat %s as permission to resend or release",async state=>{
  const f=fixture();f.prepare();f.wallet.lookup.mockResolvedValue({state});await f.worker.run(f.id);await f.worker.run(f.id);
  expect(f.wallet.send).toHaveBeenCalledTimes(1);expect(f.ledger.balance(bucket).reservedMsat).toBe("79000");
 });
 it("recovers unknown outcomes after reopening SQLite even after invoice expiry",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"bw-worker-"));dirs.push(dir);const path=join(dir,"fixture.sqlite");
  const f=fixture(path);f.prepare();f.wallet.lookup.mockRejectedValueOnce(new Error("SECRET"));await f.worker.run(f.id);f.db.close();
  const db=new DatabaseSync(path);dbs.push(db);const ledger=new PayoutLedger(db);
  const worker=new PayoutWorker(ledger,f.wallet,async()=>false,()=>time+4000);
  expect((await worker.run(f.id))?.state).toBe("paid");expect(f.wallet.send).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(db.prepare("SELECT * FROM bw_ledger_payout").all())).not.toContain("SECRET");
 });
 it("two competing workers send at most once",async()=>{
  const f=fixture();f.prepare();const other=new PayoutWorker(f.ledger,f.wallet,f.authorize,()=>time);
  await Promise.all([f.worker.run(f.id),other.run(f.id)]);expect(f.wallet.send).toHaveBeenCalledTimes(1);
  expect(f.ledger.status(f.id)?.state).toBe("paid");
 });
 it("rejects mismatched lookup evidence and cannot expose raw errors",async()=>{
  const f=fixture();f.prepare();f.wallet.lookup.mockResolvedValue({...f.paid,amountMsat:"78000"});
  expect((await f.worker.run(f.id))?.state).toBe("unknown");expect(f.ledger.balance(bucket).paidMsat).toBe("0");
  f.wallet.lookup.mockResolvedValue({...f.paid,feeMsat:"1001"});expect(await f.worker.run(f.id)).toMatchObject({state:"paid",feeLimitExceeded:true});
 });
 it("refuses to replace a saved invoice document and rolls back reservations on insert failure",()=>{
  const f=fixture();f.prepare();expect(()=>f.worker.prepare(bucket,f.id,invoice.toUpperCase(),terms,"1000")).toThrow("conflict");
  const other=fixture();other.db.exec("CREATE TRIGGER deny_document BEFORE INSERT ON bw_ledger_payout_invoice BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  expect(()=>other.prepare()).toThrow();expect(other.ledger.balance(bucket).reservedMsat).toBe("0");expect(other.ledger.status(other.id)).toBeNull();
 });
});
