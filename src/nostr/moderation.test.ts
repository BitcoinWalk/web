import {describe,it,expect} from "vitest";
import {finalizeEvent,type Event} from "nostr-tools";
import {managedCities,visibleManagedCities,ARCHIVE_NOTE,createCalendarDeletion,createOrganizerCancellation,createCityModerationDecision,type ManagedCity} from "./moderation";
import type {ApprovalRecord} from "./city-records";
const city={cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",slug:"radom",cityName:"Radom",description:"Walk",startAt:"2026-10-02T15:00:00Z",meetingPoint:{description:"Square",latitude:1,longitude:2},heroImageUrl:"https://example.com/i"};
const event=(id:string,created_at:number):Event=>({id:id.repeat(64),created_at,kind:30304,pubkey:"a".repeat(64),sig:"",content:"",tags:[]});
const revision={city,event:event("a",1)};
const approval:ApprovalRecord={event:event("b",2),approval:{cityId:city.cityId,cityRevisionId:revision.event.id,status:"approved"}};
describe("city lifecycle",()=>{
 it.each(["disapprove","archive"] as const)("restores the exact initial walk and approved presentation after %s",action=>{
  const initialId="c".repeat(64);
  const initialRevision={...revision,event:{...revision.event,tags:[["e",initialId,"","initial-walk"]]}};
  const original={...approval,approval:{...approval.approval,initialEventId:initialId,heroImageUrl:"https://example.com/managed.webp",slug:"radom-walk"}};
  const active=managedCities([initialRevision],[original])[0];
  const revoke=createCityModerationDecision(active,action);
  expect(JSON.parse(revoke.content).status).toBe("revoked");
  const revoked={event:event("d",3),approval:JSON.parse(revoke.content)};
  const row=managedCities([initialRevision],[original,revoked])[0];
  expect(row.state).toBe(action==="archive"?"archived":"disapproved");
  const restore=createCityModerationDecision(row,"approve");
  expect(JSON.parse(restore.content)).toMatchObject({...original.approval});
  expect(restore.tags).toContainEqual(["e",initialId,"","initial-walk"]);
  expect(restore.tags).toContainEqual(["city","radom-walk"]);
  expect(managedCities([initialRevision],[original,revoked,{event:event("e",4),approval:JSON.parse(restore.content)}])[0].state).toBe("approved");
 });
 it("does not borrow restore metadata from another revision",()=>{
  const unrelated={event:event("f",5),approval:{...approval.approval,cityRevisionId:"f".repeat(64),heroImageUrl:"https://example.com/wrong.webp"}};
  const revoked={event:event("d",6),approval:{...approval.approval,status:"revoked" as const}};
  const row=managedCities([revision],[approval,unrelated,revoked])[0];
  expect(row.previousApproval).toEqual(approval);
  const restore=createCityModerationDecision(row,"approve");
  expect(JSON.parse(restore.content)).not.toHaveProperty("heroImageUrl");
  expect(restore.tags.some(t=>t[3]==="initial-walk")).toBe(false);
  expect(()=>createCityModerationDecision({...row,previousApproval:unrelated},"approve")).toThrow("does not match");
 });
 it("hides archived cities by default and only reveals them on explicit request",()=>{
  const archivedIds=["6302b5c2-b579-4441-a828-9bffce073f97","05b52cd1-9e17-4d1a-80e9-1d3d7114db01"];
  const archived:ManagedCity[]=archivedIds.map(cityId=>({revision:{...revision,city:{...city,cityId}},decision:approval,head:approval.event.id,state:"archived"}));
  const active:ManagedCity={revision,decision:approval,head:approval.event.id,state:"approved"};
  const disapproved:ManagedCity={...active,state:"disapproved"};
  const all=[...archived,active,disapproved];
  expect(visibleManagedCities(all)).toEqual([active,disapproved]);
  expect(visibleManagedCities(all,true)).toEqual(all);
  expect(visibleManagedCities([{...archived[0],state:"approved"}])).toHaveLength(1);
  expect(all).toHaveLength(4);
 });
 it("archives via retained revocation and restores with a new approval",()=>{
  const archive:ApprovalRecord={event:event("c",3),approval:{...approval.approval,status:"revoked",note:ARCHIVE_NOTE}};
  expect(managedCities([revision],[approval,archive])[0].state).toBe("archived");
  expect(managedCities([revision],[archive,{...approval,event:event("d",4)}])[0].state).toBe("approved");
 });
 it("rejecting an alternative does not undo archive or approval",()=>{
  const rejected:ApprovalRecord={event:event("c",3),approval:{...approval.approval,cityRevisionId:"f".repeat(64),status:"rejected"}};
  expect(managedCities([revision],[approval,rejected])[0]).toMatchObject({state:"approved",head:rejected.event.id});
 });
 it("never substitutes a different city or missing approved revision",()=>{
  expect(managedCities([{...revision,city:{...city,cityId:"other"}}],[approval])).toEqual([]);
  expect(managedCities([revision],[approval,{...approval,event:event("c",3),approval:{...approval.approval,cityRevisionId:"d".repeat(64)}}])).toEqual([]);
 });
 it("lets the super-admin prepare deletion of a valid organizer-owned occurrence",()=>{
  const target=finalizeEvent({kind:31923,created_at:10,content:"Walk",tags:[["d","series:date"],["i",city.cityId]]},new Uint8Array(32).fill(2));
  const deletion=createCalendarDeletion(target,city.cityId);
  expect(deletion.tags).toEqual([["e",target.id],["k","31923"],["i",city.cityId]]);
  expect(()=>createCalendarDeletion(target,"another-city")).toThrow("Invalid calendar deletion target");
  const cancellation=createOrganizerCancellation(target,city.cityId,target.pubkey);
  expect(cancellation.tags).toEqual(deletion.tags);
  expect(cancellation.content).toContain("CANCEL WALK EVENT");
  expect(()=>createOrganizerCancellation(target,city.cityId,"f".repeat(64))).toThrow("Only the signer");
  expect(()=>createOrganizerCancellation(target,"another-city",target.pubkey)).toThrow("Invalid calendar deletion target");
 });
});
