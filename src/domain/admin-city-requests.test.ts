import {describe,expect,it} from "vitest";
import type {ApprovalRecord,CityRevision} from "../nostr/city-records";
import {ARCHIVE_NOTE} from "../nostr/moderation";
import {adminCityRequests,FINAL_REJECTION_PREFIX,visibleDecisionNote} from "./admin-city-requests";

const revision=(cityId:string,name:string,time:number):CityRevision=>({event:{id:String(time).padStart(64,"0"),pubkey:"a".repeat(64),created_at:time} as CityRevision["event"],city:{cityId,cityName:name,slug:name.toLowerCase(),startAt:"2027-01-01T12:00:00.000Z",description:"Walk",meetingPoint:{description:"Square",latitude:1,longitude:2}}});
const decision=(row:CityRevision,status:"approved"|"rejected"|"revoked",time:number,note?:string):ApprovalRecord=>({event:{id:String(time).padStart(64,"f"),created_at:time} as ApprovalRecord["event"],approval:{cityId:row.city.cityId,cityRevisionId:row.event.id,status,note}});

describe("admin city request inventory",()=>{
 it("lists one latest row per city and separates every review outcome",()=>{
  const accepted=revision("11111111-1111-4111-8111-111111111111","Accepted",1),changes=revision("22222222-2222-4222-8222-222222222222","Changes",2),rejected=revision("33333333-3333-4333-8333-333333333333","Rejected",3),pending=revision("44444444-4444-4444-8444-444444444444","Pending",4),archived=revision("55555555-5555-4555-8555-555555555555","Archived",5);
  const rows=adminCityRequests([accepted,changes,rejected,pending,archived],[decision(accepted,"approved",10),decision(changes,"rejected",11,"Fix the pin"),decision(rejected,"rejected",12,FINAL_REJECTION_PREFIX+"Duplicate city"),decision(archived,"approved",13),decision(archived,"revoked",14,ARCHIVE_NOTE)]);
  expect(rows.map(row=>[row.revision.city.cityName,row.status])).toEqual([["Accepted","accepted"],["Changes","needs-changes"],["Pending","pending"],["Rejected","rejected"],["Archived","archived"]]);
 });
 it("keeps an established city marked as a pending revision",()=>{const old=revision("66666666-6666-4666-8666-666666666666","London",1),edit={...revision(old.city.cityId,"London",2),event:{...revision(old.city.cityId,"London",2).event,tags:[["e",old.event.id,"","previous"]]}};expect(adminCityRequests([old,edit],[decision(old,"approved",3)])[0]).toMatchObject({status:"pending",established:true,revision:{event:{id:edit.event.id}}});});
 it("removes the protocol marker from reviewer-facing copy",()=>expect(visibleDecisionNote(FINAL_REJECTION_PREFIX+"Not a real city request")).toBe("Not a real city request"));
});
