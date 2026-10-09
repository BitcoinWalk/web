import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {PayoutLedger,type PayoutBucket} from "./payout-ledger";
const bucket:PayoutBucket={cityId:"ca20993a-5b7f-443e-931e-8dbaa61d05fe",walletRef:"test-wallet",destinationVersion:1,destination:"fixture@example.org"};
const incoming="a".repeat(64),preimage="1".repeat(64),outgoing=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
const databases:DatabaseSync[]=[],directories:string[]=[];
function open(path=":memory:"){const db=new DatabaseSync(path);databases.push(db);return {db,ledger:new PayoutLedger(db)};}
function credit(ledger:PayoutLedger,amount="100000",hash=incoming,b=bucket){ledger.register({...b,paymentHash:hash,amountMsat:amount});return ledger.settle(b.walletRef,hash,amount);}
afterEach(()=>{databases.splice(0).forEach(db=>{if(db.isOpen)db.close();});directories.splice(0).forEach(path=>rmSync(path,{recursive:true}));});
describe("isolated durable 79/21 ledger",()=>{
 it("credits exact integers once despite duplicate settlement and registration",()=>{
  const {ledger,db}=open();expect(credit(ledger)).toEqual({organizerMsat:"79000",retainedMsat:"21000"});credit(ledger);
  expect(db.prepare("SELECT count(*) n FROM bw_ledger_credit").get()?.n).toBe(1);
  expect(ledger.balance(bucket)).toEqual({earnedMsat:"79000",availableMsat:"79000",paidMsat:"0",reservedMsat:"0"});
 });
 it("preserves invoice snapshots and refuses wrong wallet, amount and unknown invoices",()=>{
  const {ledger}=open();credit(ledger);
  expect(()=>ledger.register({...bucket,paymentHash:incoming,amountMsat:"200000"})).toThrow("snapshot conflict");
  expect(()=>ledger.settle("wrong-wallet",incoming,"100000")).toThrow("does not match");
  expect(()=>ledger.settle(bucket.walletRef,incoming,"99999")).toThrow("does not match");
  expect(()=>ledger.settle(bucket.walletRef,"b".repeat(64),"100000")).toThrow("does not match");
 });
 it("handles values beyond Number safe range without float rounding",()=>{
  const {ledger}=open();const amount="9007199254740993";const result=credit(ledger,amount);
  expect(BigInt(result.organizerMsat)).toBe(BigInt(amount)*79n/100n);
  expect(BigInt(result.organizerMsat)+BigInt(result.retainedMsat)).toBe(BigInt(amount));
 });
 it("keeps dust until compatible credits meet the recipient minimum",()=>{
  const {ledger}=open();credit(ledger,"1000");expect(ledger.quote(bucket,"1000","100000")).toBeNull();
  credit(ledger,"1000","b".repeat(64));expect(ledger.quote(bucket,"1000","100000")).toBe("1000");
  ledger.reserve(bucket,randomUUID(),outgoing,"1000","0");expect(ledger.balance(bucket).availableMsat).toBe("580");
 });
 it("bounds quotes by recipient maximum and rejects reversed limits",()=>{
  const {ledger}=open();credit(ledger);expect(ledger.quote(bucket,"1000","10500")).toBe("10000");
  expect(ledger.quote(bucket,"10500","10500")).toBeNull();
  expect(()=>ledger.quote(bucket,"2000","1000")).toThrow("limits");
 });
 it("never combines different destinations, versions, wallets or cities",()=>{
  const {ledger}=open();credit(ledger,"1000");
  for(const b of [{...bucket,destinationVersion:2,destination:"new@example.org"},{...bucket,walletRef:"other-wallet"},{...bucket,cityId:randomUUID()}]){
   credit(ledger,"1000",createHash("sha256").update(JSON.stringify(b)).digest("hex"),b);
   expect(ledger.quote(b,"1000","100000")).toBeNull();
  }
  expect(ledger.quote(bucket,"1000","100000")).toBeNull();
  expect(()=>credit(ledger,"1000","f".repeat(64),{...bucket,destination:"changed@example.org"})).toThrow("version conflict");
 });
 it("atomically reserves credits and rejects duplicate or overdrawn attempts",()=>{
  const {ledger,db}=open();credit(ledger);const id=randomUUID();
  ledger.reserve(bucket,id,outgoing,"79000","1000");ledger.reserve(bucket,id,outgoing,"79000","1000");
  expect(()=>ledger.reserve(bucket,id,outgoing,"78000","1000")).toThrow("conflict");
  expect(()=>ledger.reserve(bucket,randomUUID(),"e".repeat(64),"1000","0")).toThrow("Insufficient");
  expect(db.prepare("SELECT count(*) n FROM bw_ledger_payout").get()?.n).toBe(1);
 });
 it("survives reopening and permits only one send claim across two database handles",()=>{
  const directory=mkdtempSync(join(tmpdir(),"bw-ledger-"));directories.push(directory);const path=join(directory,"fixture.sqlite");
  const first=open(path),id=randomUUID();credit(first.ledger);first.ledger.reserve(bucket,id,outgoing,"79000","1000");
  const second=open(path);expect(second.ledger.claimSend(id)).toBe(true);expect(first.ledger.claimSend(id)).toBe(false);
  first.db.close();second.db.close();const recovered=open(path).ledger;
  expect(recovered.status(id)?.state).toBe("unknown");expect(recovered.claimSend(id)).toBe(false);
  expect(()=>recovered.cancelUnsent(id)).toThrow("unsent");expect(recovered.balance(bucket).reservedMsat).toBe("79000");
  expect(recovered.confirmPaid(id,bucket.walletRef,outgoing,"79000","300",preimage)).toEqual({state:"paid",feeLimitExceeded:false});
  expect(recovered.balance(bucket)).toEqual({earnedMsat:"79000",availableMsat:"0",paidMsat:"79000",reservedMsat:"0"});
 });
 it("releases only a demonstrably unsent reservation, never an uncertain one",()=>{
  const {ledger}=open();credit(ledger);const id=randomUUID();ledger.reserve(bucket,id,outgoing,"79000","0");ledger.cancelUnsent(id);
  expect(ledger.balance(bucket).availableMsat).toBe("79000");expect(ledger.claimSend(id)).toBe(false);
  expect(()=>ledger.reserve(bucket,id,outgoing,"79000","0")).toThrow("conflict");
 });
 it("requires exact paid evidence and never stores a preimage",()=>{
  const {ledger,db}=open();credit(ledger);const id=randomUUID();ledger.reserve(bucket,id,outgoing,"79000","1000");
  expect(()=>ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","1",preimage)).toThrow("mismatch");ledger.claimSend(id);
  expect(()=>ledger.confirmPaid(id,"wrong-wallet",outgoing,"79000","1",preimage)).toThrow("mismatch");
  expect(()=>ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","1","2".repeat(64))).toThrow("mismatch");
  ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","1",preimage);ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","1",preimage);
  expect(()=>ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","2",preimage)).toThrow("fee evidence");
  expect(JSON.stringify(db.prepare("SELECT * FROM bw_ledger_payout").all())).not.toContain(preimage);
 });
 it("records a confirmed payout with excessive fees as paid and flags it, without reducing organizer credit",()=>{
  const {ledger}=open();credit(ledger);const id=randomUUID();ledger.reserve(bucket,id,outgoing,"79000","1000");ledger.claimSend(id);
  expect(ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","1001",preimage).feeLimitExceeded).toBe(true);
  expect(ledger.claimSend(id)).toBe(false);expect(ledger.balance(bucket).paidMsat).toBe("79000");
 });
 it("rejects malformed, fractional or excessive amounts",()=>{
  const {ledger}=open();for(const amount of ["-1","1.1","01","2100000000000000001"]){expect(()=>credit(ledger,amount)).toThrow();}
  credit(ledger);expect(()=>ledger.reserve(bucket,randomUUID(),outgoing,"999","0")).toThrow("whole satoshis");
 });
 it("conserves every millisatoshi and reports fees separately from the organizer share",()=>{
  const {ledger}=open();credit(ledger);const id=randomUUID();ledger.reserve(bucket,id,outgoing,"79000","1000");ledger.claimSend(id);
  ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","300",preimage);
  expect(ledger.accounting(bucket)).toEqual({receivedMsat:"100000",organizerMsat:"79000",retainedBeforeFeesMsat:"21000",paidFeesMsat:"300",retainedAfterPaidFeesMsat:"20700"});
  for(let amount=1;amount<=100;amount++){
   const split=credit(ledger,String(amount),createHash("sha256").update(String(amount)).digest("hex"));
   expect(BigInt(split.organizerMsat)+BigInt(split.retainedMsat)).toBe(BigInt(amount));
  }
 });
 it("rolls back a conflicting outgoing hash without stranding another allocation",()=>{
  const {ledger,db}=open();credit(ledger);ledger.reserve(bucket,randomUUID(),outgoing,"1000","0");
  expect(()=>ledger.reserve(bucket,randomUUID(),outgoing,"1000","0")).toThrow();
  expect(ledger.balance(bucket).availableMsat).toBe("78000");
  expect(db.prepare("SELECT count(*) n FROM bw_ledger_allocation").get()?.n).toBe(1);
 });
 it("keeps a completed payout completed after restart and repeated settlement",()=>{
  const directory=mkdtempSync(join(tmpdir(),"bw-ledger-paid-"));directories.push(directory);const path=join(directory,"fixture.sqlite");
  const first=open(path),id=randomUUID();credit(first.ledger);first.ledger.reserve(bucket,id,outgoing,"79000","0");first.ledger.claimSend(id);
  first.ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","1",preimage);first.db.close();
  const recovered=open(path).ledger;credit(recovered);expect(recovered.claimSend(id)).toBe(false);
  expect(recovered.status(id)).toMatchObject({state:"paid",feeLimitExceeded:true});expect(recovered.balance(bucket).availableMsat).toBe("0");
 });
 it("lists resumable attempts and only payable buckets without unfinished sends",()=>{
  const {ledger}=open();credit(ledger);expect(ledger.payableBuckets(bucket.walletRef)).toEqual([{bucket,sourceHash:incoming}]);
  const id=randomUUID();ledger.reserve(bucket,id,outgoing,"79000","1000");expect(ledger.pendingPayoutIds(bucket.walletRef)).toEqual([id]);expect(ledger.payableBuckets(bucket.walletRef)).toEqual([]);
  ledger.claimSend(id);expect(ledger.pendingPayoutIds(bucket.walletRef)).toEqual([id]);ledger.confirmPaid(id,bucket.walletRef,outgoing,"79000","1",preimage);expect(ledger.pendingPayoutIds(bucket.walletRef)).toEqual([]);
 });
});
