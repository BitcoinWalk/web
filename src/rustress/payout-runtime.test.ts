import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {PayoutLedger} from "./payout-ledger";
import {RUSTRESS_WALLET_REQUIREMENTS} from "./contract";
import {PayoutRuntime,type PayoutRuntimeDependencies} from "./payout-runtime";
const mock=vi.hoisted(()=>({binding:"ab".repeat(32),serviceId:"ce72e914-5890-4902-8e8c-16fb30d80f11",fence:"19d4c97a-aef0-43d7-b9bd-245b934d9e54",enabled:undefined as (()=>boolean)|undefined,history:vi.fn(),lookup:vi.fn(),status:vi.fn()}));
vi.mock("./nwc-reader",()=>({RustressNwcReader:class{
 binding=mock.binding;walletRef="fixture";listRecoveryTransactions=mock.history;lookupInvoice=mock.lookup;
}}));
vi.mock("./nwc-wallet",()=>({RustressNwcWallet:class{
 binding=mock.binding;walletRef="fixture";network="bc";lookup=mock.lookup;
 constructor(_r:unknown,_v:unknown,_c:unknown,_n:unknown,_p:unknown,enabled:()=>boolean){mock.enabled=enabled;}
}}));
vi.mock("./remote-journal-client",()=>({RemoteJournalClient:class{
 binding=mock.binding;serviceId=mock.serviceId;status=mock.status;
 async page(){return {state:await mock.status(),entries:[]};}
}}));
const dbs:DatabaseSync[]=[];
beforeEach(()=>{mock.enabled=undefined;mock.history.mockReset().mockResolvedValue({transactions:[],total_count:0});mock.lookup.mockReset();mock.status.mockReset().mockResolvedValue({serviceId:mock.serviceId,binding:mock.binding,fence:mock.fence,active:true,lastSequence:0});});
afterEach(()=>{for(const db of dbs.splice(0))db.close();});
function fixture(on=true){
 let enabled=on,now=1800000000;
 const db=new DatabaseSync(":memory:");dbs.push(db);
 const deps:PayoutRuntimeDependencies={ledger:new PayoutLedger(db),walletRef:"fixture",network:"bc",
  policy:{binding:mock.binding,budgetMsat:"1000000",maximumPayoutMsat:"100000",maximumFeeMsat:"10000",expiresAt:now+900},
  journal:{origin:"http://127.0.0.1:18891",serviceId:mock.serviceId},
  credentials:vi.fn(async()=>({wallet:"synthetic",checkout:"synthetic-other",journalClientToken:"synthetic"})),
  deployment:vi.fn<PayoutRuntimeDependencies["deployment"]>(async()=>({binding:mock.binding,serviceId:mock.serviceId,checkedAt:1800000000,expiresAt:1800000060,privateTransport:true,separateHost:true,backupRestoreVerified:true,exclusiveSender:true})),
  coverage:vi.fn<PayoutRuntimeDependencies["coverage"]>(async()=>({binding:mock.binding,fenceId:mock.fence,connectionStartedAt:now-100,retainedFrom:now-100,checkedAt:now,expiresAt:now+60,exclusive:true,sendersStopped:true})),
  permit:vi.fn(async()=>null),fetchJson:vi.fn(),
  evidence:vi.fn<PayoutRuntimeDependencies["evidence"]>(async()=>({binding:mock.binding,readiness:{connectionRef:"fixture",checkoutConnectionRef:"checkout",network:"mainnet",
   inventory:{checkedAt:now,expiresAt:now+900,grantedMethods:[...RUSTRESS_WALLET_REQUIREMENTS.methods],notificationsGranted:true,revoked:false,budgetMsat:1000000,remainingBudgetMsat:1000000,budgetRenewal:"never",isolated:true},
   protocol:{checkedAt:now,advertisedMethods:[...RUSTRESS_WALLET_REQUIREMENTS.methods],successfulReadMethods:["get_info","lookup_invoice","list_transactions"]},
   policy:{approvedAt:now,expiresAt:now+900,expectedNetwork:"mainnet",maximumBudgetMsat:1000000,maximumTestPaymentMsat:100000,maximumFeeMsat:10000,feeLimitVerified:true,approvedSharedWallet:false}}})),
 };
 return {deps,runtime:new PayoutRuntime(deps,()=>enabled,()=>now),disable:()=>{enabled=false;},expire:()=>{now+=61;},now};
}
describe("default-off payout runtime composition",()=>{
 it("never loads credentials or performs work by default",async()=>{
  const f=fixture(),r=new PayoutRuntime(f.deps);expect(await r.reconcile()).toEqual({state:"paused"});expect(await r.poll()).toEqual({state:"paused"});expect(f.deps.credentials).not.toHaveBeenCalled();expect(f.deps.deployment).not.toHaveBeenCalled();
 });
 it("connects verified collection without exposing operator activation",async()=>{
  const f=fixture();expect(await f.runtime.reconcile()).toEqual({state:"reconciled"});expect(f.runtime.ready).toBe(true);expect(mock.enabled?.()).toBe(true);
  const preimage="12".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
  const bucket={cityId:randomUUID(),walletRef:"fixture",destinationVersion:1,destination:"fixture@example.org"};
  await f.runtime.register({...bucket,paymentHash:hash,amountMsat:"100000"});
  mock.lookup.mockResolvedValue({type:"incoming",state:"settled",payment_hash:hash,amount:100000,settled_at:f.now,preimage});
  expect(await f.runtime.poll()).toMatchObject({state:"completed"});expect(f.deps.ledger.balance(bucket).earnedMsat).toBe("79000");
  expect(f.deps.permit).not.toHaveBeenCalled();expect("activate" in f.runtime).toBe(false);
 });
 it.each(["binding","service","expiry","missing"])("blocks %s deployment evidence before reading secrets",async mode=>{
  const f=fixture(),d=await f.deps.deployment();
  if(mode==="binding")d.binding="wrong";if(mode==="service")d.serviceId=randomUUID();if(mode==="expiry")d.expiresAt=f.now;
  vi.mocked(f.deps.deployment).mockResolvedValue(mode==="missing"?{} as typeof d:d);
  expect(await f.runtime.reconcile()).toEqual({state:"blocked"});expect(f.deps.credentials).not.toHaveBeenCalled();
 });
 it("requires history and an active journal, without activating it",async()=>{
  const f=fixture();mock.status.mockResolvedValue({active:false});expect(await f.runtime.reconcile()).toEqual({state:"blocked"});expect(f.runtime.ready).toBe(false);
 });
 it("pause and expiry invalidate the wallet enable callback",async()=>{
  const f=fixture();await f.runtime.reconcile();f.expire();expect(f.runtime.ready).toBe(false);expect(mock.enabled?.()).toBe(false);expect(await f.runtime.run(randomUUID())).toEqual({state:"paused"});
  f.runtime.pause();expect(f.runtime.ready).toBe(false);
 });
 it("serializes startup and pause defeats late completion",async()=>{
  const f=fixture(),d=await f.deps.deployment();let release!:(value:typeof d)=>void;
  vi.mocked(f.deps.deployment).mockImplementationOnce(()=>new Promise(r=>{release=r;}));
  const first=f.runtime.reconcile();expect(await f.runtime.reconcile()).toEqual({state:"paused"});f.runtime.pause();release(d);
  expect(await first).toEqual({state:"blocked"});expect(f.deps.credentials).not.toHaveBeenCalled();
 });
 it("disable during evidence collection prevents credential loading",async()=>{
  const f=fixture(),e=await f.deps.evidence();vi.mocked(f.deps.evidence).mockImplementationOnce(async()=>{f.disable();return e;});
  expect(await f.runtime.reconcile()).toEqual({state:"blocked"});expect(f.deps.credentials).not.toHaveBeenCalled();
 });
});
