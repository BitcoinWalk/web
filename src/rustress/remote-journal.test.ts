import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {afterEach,describe,it,expect,vi} from "vitest";
import {RemoteJournalStore} from "./remote-journal-store";
import {RemoteJournalClient} from "./remote-journal-client";
import {RemoteJournalRecovery} from "./remote-journal-recovery";
import {createRemoteJournalServer} from "./remote-journal-server";
import {PayoutLedger} from "./payout-ledger";
const binding="ab".repeat(32),token="a".repeat(43),admin="b".repeat(43);
const dbs:DatabaseSync[]=[],dirs:string[]=[];
const open=(path=":memory:")=>{const db=new DatabaseSync(path);dbs.push(db);return db;};
afterEach(()=>{for(const db of dbs.splice(0))if(db.isOpen)db.close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true});});
function fixture(path=":memory:"){
 const db=open(path),store=new RemoteJournalStore(db,binding),initial=store.state();
 const state=store.control(initial.serviceId,initial.fence,"activate");
 const transport=vi.fn<typeof fetch>(async(url,options)=>{
  const path=new URL(String(url)).pathname,body=options?.body?JSON.parse(String(options.body)):undefined;
  const result=path.endsWith("/status")?store.state():path.endsWith("/page")?store.page(body.after):store.claim(body);
  return new Response(JSON.stringify(result),{status:200});
 });
 const client=new RemoteJournalClient("http://127.0.0.1:8891",token,state.serviceId,binding,transport);
 const claim={serviceId:state.serviceId,binding,fence:state.fence!,id:randomUUID(),hash:"cd".repeat(32),commitment:"ef".repeat(32)};
 return {db,store,state,client,transport,claim};
}
describe("remote durable journal protocol",()=>{
 it("acknowledges the first committed claim, but exact retry is recorded only",async()=>{
  const f=fixture();expect((await f.client.claim(f.claim)).outcome).toBe("created");expect((await f.client.claim(f.claim)).outcome).toBe("recorded");
  expect((await f.client.page()).entries).toHaveLength(1);
 });
 it.each(["id","hash","commitment"])("rejects a conflicting %s",async field=>{
  const f=fixture();await f.client.claim(f.claim);
  const changed={...f.claim,[field]:field==="id"?randomUUID():"12".repeat(32)};
  await expect(f.client.claim(changed)).rejects.toThrow();expect(f.store.page().entries).toHaveLength(1);
 });
 it("rejects foreign binding, service and stale fencing token",async()=>{
  const f=fixture();expect(()=>f.store.claim({...f.claim,binding:"12".repeat(32)})).toThrow();
  expect(()=>f.store.claim({...f.claim,serviceId:randomUUID()})).toThrow();
  const paused=f.store.control(f.state.serviceId,f.state.fence,"pause");expect(()=>f.store.claim(f.claim)).toThrow();
  f.store.control(paused.serviceId,paused.fence,"activate");expect(()=>f.store.claim(f.claim)).toThrow();
  expect(()=>f.store.control(f.state.serviceId,f.state.fence,"activate")).toThrow();
 });
 it("persists exact claims and service identity after reopening SQLite",()=>{
  const dir=mkdtempSync(join(tmpdir(),"bw-remote-journal-"));dirs.push(dir);const path=join(dir,"journal.sqlite"),f=fixture(path);
  f.store.claim(f.claim);f.db.close();const reopened=new RemoteJournalStore(open(path),binding);
  const paused=reopened.state();expect(paused.serviceId).toBe(f.state.serviceId);expect(paused.active).toBe(false);
  expect(()=>reopened.claim(f.claim)).toThrow();const fresh=reopened.control(paused.serviceId,paused.fence,"activate");
  expect(reopened.claim({...f.claim,fence:fresh.fence!}).outcome).toBe("recorded");
 });
 it("does not acknowledge a failed database write",async()=>{
  const f=fixture();f.db.exec("CREATE TRIGGER reject_claim BEFORE INSERT ON remote_journal_entry BEGIN SELECT RAISE(ABORT,'private'); END");
  await expect(f.client.claim(f.claim)).rejects.toThrow(/^Journal outcome unconfirmed; sending remains blocked$/);expect(f.store.page().entries).toHaveLength(0);
 });
 it("a lost acknowledgement never turns a retry into a new permission",async()=>{
  const f=fixture();f.transport.mockImplementationOnce(async(_url,options)=>{f.store.claim(JSON.parse(String(options!.body)));throw new Error("private");});
  await expect(f.client.claim(f.claim)).rejects.toThrow("unconfirmed");expect((await f.client.claim(f.claim)).outcome).toBe("recorded");
 });
 it("competing identical requests get only one first-claim acknowledgement",async()=>{
  const f=fixture(),results=await Promise.all([f.client.claim(f.claim),f.client.claim(f.claim)]);
  expect(results.map(r=>r.outcome).sort()).toEqual(["created","recorded"]);
 });
 it("blocks a restored ledger missing the remotely journaled payout",async()=>{
  const f=fixture();await f.client.claim(f.claim);const gate=new RemoteJournalRecovery(f.client,new PayoutLedger(open()),"fixture",
   async()=>({binding,complete:true,outgoingHashes:[f.claim.hash]}),vi.fn(),()=>true);
  expect(await gate.reconcile()).toEqual({state:"blocked"});expect(gate.ready).toBe(false);
 });
 it("bounds pages and rejects excessive or wrong-identity responses",async()=>{
  const f=fixture();f.transport.mockResolvedValueOnce(new Response("x".repeat(32769)));await expect(f.client.status()).rejects.toThrow();
  f.transport.mockResolvedValueOnce(new Response(JSON.stringify({...f.state,serviceId:randomUUID()})));await expect(f.client.status()).rejects.toThrow("identity");
  expect(()=>new RemoteJournalClient("https://public.example",token,f.state.serviceId,binding)).toThrow();
 });
 it("has no automatic activation for a newly created journal",()=>{
  const store=new RemoteJournalStore(open(),binding);expect(store.state()).toMatchObject({active:false,fence:null});
 });
 it("connects journal claims to ledger recovery and blocks on outage",async()=>{
  const f=fixture(),ledger=new PayoutLedger(open()),bucket={cityId:randomUUID(),walletRef:"fixture",destinationVersion:1,destination:"test@example.org"};
  ledger.register({...bucket,paymentHash:"11".repeat(32),amountMsat:"100000"});ledger.settle("fixture","11".repeat(32),"100000");
  const preimage="12".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex"),id=randomUUID();
  ledger.reserve(bucket,id,hash,"79000","10000","fixture invoice");
  const history=vi.fn(async()=>({binding,complete:true,outgoingHashes:[] as string[]}));
  const lookup=vi.fn(async()=>({state:"paid" as const,walletRef:"fixture",paymentHash:hash,amountMsat:"79000",feeMsat:"1000",preimage}));
  const gate=new RemoteJournalRecovery(f.client,ledger,"fixture",history,lookup,()=>true);
  expect(await gate.reconcile()).toEqual({state:"reconciled"});ledger.claimSend(id);expect(await gate.claim(id)).toBe(true);
  gate.pause();history.mockResolvedValue({binding,complete:true,outgoingHashes:[hash]});expect(await gate.reconcile()).toEqual({state:"reconciled"});expect(ledger.status(id)?.state).toBe("paid");
  f.transport.mockRejectedValueOnce(new Error("offline"));expect(await gate.reconcile()).toEqual({state:"blocked"});expect(gate.ready).toBe(false);
 });
 it("remote recovery defaults to blocked without deployment approval",async()=>{
  const f=fixture(),history=vi.fn();const gate=new RemoteJournalRecovery(f.client,new PayoutLedger(open()),"fixture",history,vi.fn());
  expect(await gate.reconcile()).toEqual({state:"blocked"});expect(f.transport).not.toHaveBeenCalled();
 });
 it("serves authenticated loopback requests with separate operator authority",async()=>{
  const f=fixture(),server=createRemoteJournalServer(f.store,{clientToken:token,operatorToken:admin});
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  try{
   const address=server.address() as {port:number},origin=`http://127.0.0.1:${address.port}`;
   expect((await fetch(origin+"/v1/journal/status")).status).toBe(403);
   const body=JSON.stringify({serviceId:f.state.serviceId,expectedFence:f.state.fence,action:"pause"});
   expect((await fetch(origin+"/v1/journal/control",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body})).status).toBe(403);
   const client=new RemoteJournalClient(origin,token,f.state.serviceId,binding);expect((await client.claim(f.claim)).outcome).toBe("created");
   expect((await fetch(origin+"/v1/journal/control",{method:"POST",headers:{Authorization:`Bearer ${admin}`,"Content-Type":"application/json"},body})).status).toBe(200);
   await expect(client.claim({...f.claim,id:randomUUID(),hash:"13".repeat(32)})).rejects.toThrow();
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
});
