import {describe,it,expect,vi} from "vitest";
import {createRecoveryHistory,type RecoveryCoverage} from "./recovery-history";
const binding="ab".repeat(32),now=1800000000;
function fixture(count=0){
 const rows=Array.from({length:count},(_,i)=>({type:"outgoing",payment_hash:i.toString(16).padStart(64,"0"),amount:79000,state:"settled",created_at:now-50,settled_at:now-40,fees_paid:1000}));
 const reader={binding,listRecoveryTransactions:vi.fn(async(offset:number,limit:number)=>({transactions:rows.slice(offset,offset+limit),total_count:rows.length}))};
 const evidence:RecoveryCoverage={binding,fenceId:"00000000-0000-4000-8000-000000000001",connectionStartedAt:now-100,retainedFrom:now-100,checkedAt:now,expiresAt:now+60,exclusive:true,sendersStopped:true,acceptedPriorSpends:[]};
 const coverage=vi.fn(async()=>evidence),collect=createRecoveryHistory(reader,coverage,()=>now);
 return {reader,coverage,evidence,collect,rows};
}
describe("authenticated full-history collector with trusted retention coverage",()=>{
 it.each([0,1,50,51,100])("checks two stable complete scans of %s transactions",async count=>{
  const f=fixture(count);expect(await f.collect()).toMatchObject({binding,complete:true,outgoingHashes:f.rows.map(row=>row.payment_hash)});
  expect(f.reader.listRecoveryTransactions).toHaveBeenCalledTimes(2*Math.max(1,Math.ceil(count/50)));
 });
 it.each(["retention","stale","expired","binding","future-start"])("rejects %s coverage before requesting history",async mode=>{
  const f=fixture();if(mode==="retention")f.evidence.retainedFrom=now-10;if(mode==="stale")f.evidence.checkedAt=now-61;
  if(mode==="expired")f.evidence.expiresAt=now;if(mode==="binding")f.evidence.binding="cd".repeat(32);if(mode==="future-start")f.evidence.connectionStartedAt=now+1;
  expect((await f.collect()).complete).toBe(false);expect(f.reader.listRecoveryTransactions).not.toHaveBeenCalled();
 });
 it("rejects an early short page or missing totals",async()=>{
  const f=fixture(51);f.reader.listRecoveryTransactions.mockResolvedValueOnce({transactions:f.rows.slice(0,1),total_count:51});
  expect((await f.collect()).complete).toBe(false);
  f.reader.listRecoveryTransactions.mockResolvedValueOnce({transactions:[],total_count:NaN});expect((await f.collect()).complete).toBe(false);
 });
 it("rejects repeated pages and changing totals",async()=>{
  const f=fixture(51);f.reader.listRecoveryTransactions.mockResolvedValue({transactions:f.rows.slice(0,50),total_count:51});expect((await f.collect()).complete).toBe(false);
 });
 it("does not treat pending or failed outgoing payments as absent",async()=>{
  const f=fixture(2);f.rows[0].state="pending";f.rows[1].state="failed";
  expect((await f.collect()).outgoingHashes).toHaveLength(2);
 });
 it("accounts for an exact accepted pre-service spend and rejects changed evidence",async()=>{
  const f=fixture(1),row=f.rows[0];f.evidence.acceptedPriorSpends=[{paymentHash:row.payment_hash,amountMsat:String(row.amount),feeMsat:String(row.fees_paid),createdAt:row.created_at,settledAt:row.settled_at!}];
  expect(await f.collect()).toMatchObject({complete:true,outgoingHashes:[],acceptedPriorSpentMsat:"80000"});
  f.evidence.acceptedPriorSpends[0].feeMsat="1001";expect((await f.collect()).complete).toBe(false);
 });
 it("rejects history changes between scans even with unchanged total",async()=>{
  const f=fixture(1);f.reader.listRecoveryTransactions.mockResolvedValueOnce({transactions:[{...f.rows[0],state:"pending"}],total_count:1});
  expect((await f.collect()).complete).toBe(false);
 });
 it("rejects a changed sender fence after scanning",async()=>{
  const f=fixture();f.coverage.mockResolvedValueOnce({...f.evidence}).mockResolvedValueOnce({...f.evidence,fenceId:"00000000-0000-4000-8000-000000000002"});
  expect((await f.collect()).complete).toBe(false);
 });
 it("redacts provider errors and bounds large inventories",async()=>{
  const f=fixture();f.reader.listRecoveryTransactions.mockRejectedValueOnce(new Error("SECRET"));expect(await f.collect()).toEqual({binding,complete:false,outgoingHashes:[]});
  f.reader.listRecoveryTransactions.mockResolvedValueOnce({transactions:[],total_count:10001});expect((await f.collect()).complete).toBe(false);
 });
});
