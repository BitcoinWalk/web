import {afterEach,describe,expect,it} from "vitest";
import {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {PaymentStore} from "../payments/service";
import {queueApprovedPaidCityRelays} from "./relay-provision-reconcile";
import {SILENT_ACTIVE_OVERRIDE_NOTE} from "../domain/admin-city-requests";

const cityId="11111111-1111-4111-8111-111111111111",revisionId="a".repeat(64),approvalId="b".repeat(64),paymentHash="c".repeat(64);
const event=(id:string,created_at:number):Event=>({id,pubkey:"d".repeat(64),created_at,kind:30302,tags:[],content:"",sig:"e".repeat(128)});
const revision={event:event(revisionId,1),city:{cityId,cityName:"Graz Test",slug:"graz-test",requestedTier:"paid" as const}};
const approval={event:event(approvalId,2),approval:{cityId,cityRevisionId:revisionId,status:"approved" as const,slug:"graz-test"}};
const databases:DatabaseSync[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();});

describe("paid city relay reconciliation",()=>{
 it("queues an approved entitled city once and keeps the signed scope exact",()=>{
  const db=new DatabaseSync(":memory:");databases.push(db);const payment=new PaymentStore(db);
  payment.db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,"owner",paymentHash,"invoice",1);
  const first=queueApprovedPaidCityRelays(payment,{revisions:[revision] as never,approvals:[approval] as never});
  const second=queueApprovedPaidCityRelays(payment,{revisions:[revision] as never,approvals:[approval] as never});
  expect(first).toHaveLength(1);expect(second).toHaveLength(1);
  expect(first[0]).toMatchObject({cityId,revisionId,approvalEventId:approvalId,slug:"graz-test",phase:"queued",attempts:0});
  expect(second[0].evidenceDigest).toBe(first[0].evidenceDigest);
 });

 it("does not queue an unentitled or non-approved city",()=>{
  const db=new DatabaseSync(":memory:");databases.push(db);const payment=new PaymentStore(db);
  expect(queueApprovedPaidCityRelays(payment,{revisions:[revision] as never,approvals:[approval] as never})).toEqual([]);
  payment.db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,"owner",paymentHash,"invoice",1);
  const revoked={...approval,event:event("f".repeat(64),3),approval:{...approval.approval,status:"revoked" as const}};
  expect(queueApprovedPaidCityRelays(payment,{revisions:[revision] as never,approvals:[approval,revoked] as never})).toEqual([]);
 });

 it("does not provision a relay for a silent Active override",()=>{
  const db=new DatabaseSync(":memory:");databases.push(db);const payment=new PaymentStore(db);
  payment.db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,"owner",paymentHash,"invoice",1);
  const silent={...approval,approval:{...approval.approval,note:SILENT_ACTIVE_OVERRIDE_NOTE}};
  expect(queueApprovedPaidCityRelays(payment,{revisions:[revision] as never,approvals:[silent] as never})).toEqual([]);
 });
});
