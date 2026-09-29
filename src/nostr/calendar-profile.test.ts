import {beforeEach,describe,it,expect,vi} from "vitest";
import {finalizeEvent,getPublicKey,nip19,type Event} from "nostr-tools";
vi.mock("./city-records",()=>({queryCalendarEvents:vi.fn(),queryDirectoryRecords:vi.fn()}));
import {queryCalendarEvents,queryDirectoryRecords,type ApprovalRecord} from "./city-records";
import {resolveCalendarLink} from "./calendar-records";
import {createInitialCalendarProposal,createOrganizerCalendarEvent} from "./calendar-event";

const key=new Uint8Array(32).fill(2);
const city={cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",slug:"norilsk",cityName:"Norilsk",description:"Original city description",startAt:"2026-10-10T10:30:00Z",meetingPoint:{description:"Square",latitude:69.3,longitude:88.2}};
const record=(id:string,time:number):Event=>({id:id.repeat(64),created_at:time,pubkey:getPublicKey(key),sig:"",kind:30303,tags:[],content:""});
const original={event:record("a",1),city};
const latest={event:record("b",3),city:{...city,description:"Lorem ipsum"}};
const pending={event:record("c",5),city:{...city,description:"Pending city text"}};
const rejected={event:record("d",6),city:{...city,description:"Rejected city text"}};
const firstApproval:ApprovalRecord={event:record("e",2),approval:{cityId:city.cityId,cityRevisionId:original.event.id,status:"approved"}};
const latestApproval:ApprovalRecord={event:record("f",4),approval:{cityId:city.cityId,cityRevisionId:latest.event.id,status:"approved"}};
const rejection:ApprovalRecord={event:record("9",7),approval:{cityId:city.cityId,cityRevisionId:rejected.event.id,status:"rejected"}};

describe("current approved city profile on exact event pages",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it.each(["initial","scheduled"])("keeps %s event content intact while selecting only approved city text",async(kind)=>{
    const first=finalizeEvent(createInitialCalendarProposal(city,"UTC"),key);
    const approval={...firstApproval,approval:{...firstApproval.approval,initialEventId:first.id}};
    const signed=kind==="initial"?first:finalizeEvent(createOrganizerCalendarEvent({revision:original,approval},{id:`${city.cityId}:2026-10-10`,seriesId:city.cityId,localDate:"2026-10-10",localTime:"10:30",timeZone:"UTC",start:1791628200,end:1791631800,meetingPoint:city.meetingPoint,description:"Special route for this occurrence"}),key);
    const before=JSON.stringify(signed);
    vi.mocked(queryCalendarEvents).mockResolvedValue([signed]);
    vi.mocked(queryDirectoryRecords).mockResolvedValue({revisions:[original,latest,pending,rejected],approvals:[approval,latestApproval,rejection]});
    const resolved=await resolveCalendarLink(nip19.neventEncode({id:signed.id}),["wss://example.com"]);
    expect(resolved?.currentProfile.revision.city.description).toBe("Lorem ipsum");
    expect(resolved?.event.content).toBe(kind==="initial"?city.description:"Special route for this occurrence");
    expect(JSON.stringify(signed)).toBe(before);
    if(kind==="scheduled")expect(resolved?.walk.revision.event.id).toBe(original.event.id);
  });
  it("does not expose a revoked city's old event or profile",async()=>{
    const signed=finalizeEvent(createInitialCalendarProposal(city,"UTC"),key);
    vi.mocked(queryCalendarEvents).mockResolvedValue([signed]);
    vi.mocked(queryDirectoryRecords).mockResolvedValue({revisions:[original,latest],approvals:[firstApproval,latestApproval,{event:record("9",8),approval:{...latestApproval.approval,status:"revoked"}}]});
    expect(await resolveCalendarLink(nip19.neventEncode({id:signed.id}),["wss://example.com"])).toBeNull();
  });
});
