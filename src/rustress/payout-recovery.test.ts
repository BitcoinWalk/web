import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {copyFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {PayoutLedger} from "./payout-ledger";
import {PayoutRecovery} from "./payout-recovery";
import type {PayoutWallet} from "./payout-worker";
const binding="ab".repeat(32),preimage="12".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
const handles:DatabaseSync[]=[],dirs:string[]=[];
afterEach(()=>{for(const db of handles.splice(0))if(db.isOpen)db.close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true});});
function open(path:string){const db=new DatabaseSync(path);handles.push(db);return db;}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),"bw-restore-"));dirs.push(dir);
 const path=join(dir,"ledger.sqlite"),backup=join(dir,"backup.sqlite"),journal=open(join(dir,"independent-journal.sqlite"));
 let db=open(path),ledger=new PayoutLedger(db);
 const bucket={cityId:randomUUID(),walletRef:"fixture",destinationVersion:1,destination:"fixture@example.org"},id=randomUUID();
 ledger.register({...bucket,paymentHash:"cd".repeat(32),amountMsat:"100000"});ledger.settle("fixture","cd".repeat(32),"100000");
 const history=vi.fn(async()=>({binding,complete:true,outgoingHashes:[] as string[]}));
 const paid={state:"paid" as const,walletRef:"fixture",paymentHash:hash,amountMsat:"79000",feeMsat:"1000",preimage};
 const lookup=vi.fn<PayoutWallet["lookup"]>(async()=>paid);
 // Independent filesystem topology is simulated here, never approved for live use.
 const guard=()=>new PayoutRecovery(journal,ledger,"fixture",binding,history,lookup,()=>true);
 const reserve=()=>ledger.reserve(bucket,id,hash,"79000","10000","private fixture invoice");
 const snapshot=()=>{db.close();copyFileSync(path,backup);db=open(path);ledger=new PayoutLedger(db);};
 const restore=()=>{db.close();copyFileSync(backup,path);db=open(path);ledger=new PayoutLedger(db);};
 return {get ledger(){return ledger;},get db(){return db;},journal,bucket,id,guard,reserve,snapshot,restore,history,lookup,paid};
}
describe("older-backup payout quarantine and independent journal",()=>{
 it("requires a separate trusted storage preflight",async()=>{
  const f=fixture(),g=new PayoutRecovery(f.journal,f.ledger,"fixture",binding,f.history,f.lookup);
  expect(await g.reconcile()).toEqual({state:"blocked"});expect(f.history).not.toHaveBeenCalled();
 });
 it("starts paused and permits only a fully reconciled empty exclusive wallet",async()=>{
  const f=fixture(),g=f.guard();expect(g.ready).toBe(false);expect(g.claim(f.id)).toBe(false);
  expect(await g.reconcile()).toEqual({state:"reconciled"});expect(g.ready).toBe(true);
 });
 it("an explicit pause during an audit cannot be undone by its late response",async()=>{
  const f=fixture();let resolve!:(h:{binding:string;complete:boolean;outgoingHashes:string[]})=>void;
  f.history.mockImplementation(()=>new Promise(r=>{resolve=r;}));const g=f.guard(),audit=g.reconcile();g.pause();
  resolve({binding,complete:true,outgoingHashes:[]});expect(await audit).toEqual({state:"blocked"});expect(g.ready).toBe(false);
 });
 it("restores a prepared backup after payment and confirms paid without resending",async()=>{
  const f=fixture();f.reserve();f.snapshot();let g=f.guard();await g.reconcile();
  let sends=0;if(f.ledger.claimWithinBudget(f.id,"fixture","100000")&&g.claim(f.id))sends++;
  f.ledger.confirmPaid(f.id,"fixture",hash,"79000","1000",preimage);
  f.history.mockResolvedValue({binding,complete:true,outgoingHashes:[hash]});
  f.restore();g=f.guard();expect(g.ready).toBe(false);expect(f.ledger.status(f.id)?.state).toBe("prepared");
  expect(await g.reconcile()).toEqual({state:"reconciled"});
  if(f.ledger.claimWithinBudget(f.id,"fixture","100000")&&g.claim(f.id))sends++;
  expect(sends).toBe(1);expect(f.ledger.status(f.id)?.state).toBe("paid");expect(f.ledger.balance(f.bucket).availableMsat).toBe("0");
 });
 it("blocks a backup missing the entire post-backup payout and its allocations",async()=>{
  const f=fixture();f.snapshot();f.reserve();const g=f.guard();await g.reconcile();f.ledger.claimSend(f.id);expect(g.claim(f.id)).toBe(true);
  f.history.mockResolvedValue({binding,complete:true,outgoingHashes:[hash]});f.restore();
  const restored=f.guard();expect(await restored.reconcile()).toEqual({state:"blocked"});expect(restored.ready).toBe(false);
  expect(f.ledger.balance(f.bucket).availableMsat).toBe("79000"); // apparently free, but quarantined
 });
 it.each(["pending","failed","not-found"] as const)("never releases a %s outcome after restore",async state=>{
  const f=fixture();f.reserve();f.snapshot();const g=f.guard();await g.reconcile();f.ledger.claimSend(f.id);g.claim(f.id);
  f.history.mockResolvedValue({binding,complete:true,outgoingHashes:[hash]});f.lookup.mockResolvedValue({state});f.restore();
  const restored=f.guard();expect(await restored.reconcile()).toEqual({state:"blocked"});expect(f.ledger.status(f.id)?.state).toBe("unknown");
  expect(f.ledger.balance(f.bucket).reservedMsat).toBe("79000");
 });
 it.each(["incomplete","wrong-binding","unknown-payment","duplicate"])("rejects %s history without enabling sends",async mode=>{
  const f=fixture();f.history.mockResolvedValue({binding:mode==="wrong-binding"?"ef".repeat(32):binding,complete:mode!=="incomplete",outgoingHashes:mode==="unknown-payment"?[hash]:mode==="duplicate"?[hash,hash]:[]});
  const g=f.guard();expect(await g.reconcile()).toEqual({state:"blocked"});expect(g.ready).toBe(false);
 });
 it("blocks altered allocations even when wallet payment is genuine",async()=>{
  const f=fixture();f.reserve();const g=f.guard();await g.reconcile();f.ledger.claimSend(f.id);g.claim(f.id);
  f.db.prepare("UPDATE bw_ledger_allocation SET amount='78000' WHERE payout=?").run(f.id);
  f.history.mockResolvedValue({binding,complete:true,outgoingHashes:[hash]});expect(await f.guard().reconcile()).toEqual({state:"blocked"});
 });
 it("blocks journal loss if either ledger or independent history contains a send",async()=>{
  const f=fixture();f.reserve();f.ledger.claimSend(f.id);
  expect(await f.guard().reconcile()).toEqual({state:"blocked"});
 });
 it("journal write failure pauses sending while keeping the obligation reserved",async()=>{
  const f=fixture();f.reserve();const g=f.guard();await g.reconcile();
  f.journal.exec("CREATE TRIGGER deny_send BEFORE INSERT ON bw_send_journal BEGIN SELECT RAISE(ABORT,'fixture'); END");
  f.ledger.claimSend(f.id);expect(g.claim(f.id)).toBe(false);expect(g.ready).toBe(false);expect(f.ledger.balance(f.bucket).reservedMsat).toBe("79000");
 });
 it("rejects conflicting wallet proof without leaking wallet errors",async()=>{
  const f=fixture();f.reserve();const g=f.guard();await g.reconcile();f.ledger.claimSend(f.id);g.claim(f.id);
  f.history.mockResolvedValue({binding,complete:true,outgoingHashes:[hash]});f.lookup.mockResolvedValue({...f.paid,amountMsat:"78000"});
  expect(await g.reconcile()).toEqual({state:"blocked"});expect(g.ready).toBe(false);
 });
});
