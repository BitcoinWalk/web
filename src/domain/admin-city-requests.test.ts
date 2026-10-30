import {describe,expect,it} from "vitest";
import type {ApprovalRecord,CityRevision} from "../nostr/city-records";
import {ARCHIVE_NOTE,DELETE_CITY_NOTE} from "../nostr/moderation";
import {adminCityRequests,createSilentActiveOverrideDecision,duplicateCityRejectionNote,FINAL_REJECTION_PREFIX,isSilentActiveOverride,matchingExistingCity,SILENT_ACTIVE_OVERRIDE_NOTE,visibleDecisionNote} from "./admin-city-requests";

const revision=(cityId:string,name:string,time:number):CityRevision=>({event:{id:String(time).padStart(64,"0"),pubkey:"a".repeat(64),created_at:time} as CityRevision["event"],city:{cityId,cityName:name,slug:name.toLowerCase(),startAt:"2027-01-01T12:00:00.000Z",description:"Walk",meetingPoint:{description:"Square",latitude:1,longitude:2}}});
const decision=(row:CityRevision,status:"approved"|"rejected"|"revoked",time:number,note?:string):ApprovalRecord=>({event:{id:String(time).padStart(64,"f"),created_at:time} as ApprovalRecord["event"],approval:{cityId:row.city.cityId,cityRevisionId:row.event.id,status,note}});

describe("admin city request inventory",()=>{
 it("lists one latest row per city and separates every review outcome",()=>{
  const accepted=revision("11111111-1111-4111-8111-111111111111","Accepted",1),changes=revision("22222222-2222-4222-8222-222222222222","Changes",2),rejected=revision("33333333-3333-4333-8333-333333333333","Rejected",3),pending=revision("44444444-4444-4444-8444-444444444444","Pending",4),archived=revision("55555555-5555-4555-8555-555555555555","Archived",5);
  const rows=adminCityRequests([accepted,changes,rejected,pending,archived],[decision(accepted,"approved",10),decision(changes,"rejected",11,"Fix the pin"),decision(rejected,"rejected",12,FINAL_REJECTION_PREFIX+"Duplicate city"),decision(archived,"approved",13),decision(archived,"revoked",14,ARCHIVE_NOTE)]);
  expect(rows.map(row=>[row.revision.city.cityName,row.status])).toEqual([["Accepted","accepted"],["Changes","needs-changes"],["Pending","pending"],["Rejected","rejected"],["Archived","archived"]]);
 });
 it("keeps an established city marked as a pending revision",()=>{const old=revision("66666666-6666-4666-8666-666666666666","London",1),edit={...revision(old.city.cityId,"London",2),event:{...revision(old.city.cityId,"London",2).event,tags:[["e",old.event.id,"","previous"]]}};expect(adminCityRequests([old,edit],[decision(old,"approved",3)])[0]).toMatchObject({status:"pending",established:true,revision:{event:{id:edit.event.id}}});});
 it("omits a city after the latest signed decision permanently deletes it",()=>{const removed=revision("77777777-7777-4777-8777-777777777777","Removed",1);expect(adminCityRequests([removed],[decision(removed,"approved",2),decision(removed,"revoked",3,DELETE_CITY_NOTE)])).toEqual([]);});
 it("removes the protocol marker from reviewer-facing copy",()=>expect(visibleDecisionNote(FINAL_REJECTION_PREFIX+"Not a real city request")).toBe("Not a real city request"));
 it("links a duplicate application to an already-established city",()=>{
  const london=revision("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","London",1),duplicate={...revision("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","London",2),city:{...revision("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","London",2).city,slug:"london-copy"}},rows=adminCityRequests([london,duplicate],[decision(london,"approved",3)]),application=rows.find(row=>row.revision.city.cityId===duplicate.city.cityId)!;
  expect(matchingExistingCity(application,rows)?.city.cityId).toBe(london.city.cityId);
  expect(duplicateCityRejectionNote(london.city)).toBe("A BitcoinWalk already exists in London. Please join the existing city at https://bitcoinwalk.org/london or contact its organizers instead of creating a duplicate city.");
 });
 it("does not flag an archived or unrelated city as an existing duplicate",()=>{
  const london=revision("cccccccc-cccc-4ccc-8ccc-cccccccccccc","London",1),lisbon=revision("dddddddd-dddd-4ddd-8ddd-dddddddddddd","Lisbon",2),rows=adminCityRequests([london,lisbon],[decision(london,"approved",3),decision(london,"revoked",4,ARCHIVE_NOTE)]),application=rows.find(row=>row.revision.city.cityId===lisbon.city.cityId)!;
  expect(matchingExistingCity(application,rows)).toBeUndefined();
 });
 it("lets a newer signed super-admin override activate the exact rejected revision",()=>{const row=revision("88888888-8888-4888-8888-888888888888","Override",1),changes=decision(row,"rejected",2,"Change the photo"),active=decision(row,"approved",3,SILENT_ACTIVE_OVERRIDE_NOTE);expect(adminCityRequests([row],[changes,active])[0]).toMatchObject({status:"accepted",decision:active});expect(isSilentActiveOverride(active.approval.note)).toBe(true);expect(visibleDecisionNote(active.approval.note)).toContain("Activated as-is");});
 it("builds the silent override from only the exact rejected revision",()=>{const row=revision("99999999-9999-4999-8999-999999999999","Exact",1),rejection=decision(row,"rejected",2,"Change it"),content=JSON.parse(createSilentActiveOverrideDecision({revision:row,rejection}).content);expect(content).toMatchObject({cityId:row.city.cityId,cityRevisionId:row.event.id,status:"approved",slug:row.city.slug,note:SILENT_ACTIVE_OVERRIDE_NOTE});expect(()=>createSilentActiveOverrideDecision({revision:row,rejection:{...rejection,approval:{...rejection.approval,cityRevisionId:"f".repeat(64)}}})).toThrow("no longer matches");});
});
