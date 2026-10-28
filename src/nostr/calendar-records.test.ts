import {describe,it,expect,vi} from "vitest";
import {finalizeEvent,getPublicKey,nip19,type Event} from "nostr-tools";
vi.mock("./authority",()=>({isSuperAdmin:(key:string)=>key===getPublicKey(new Uint8Array(32).fill(1)),SUPER_ADMIN_PUBKEY:getPublicKey(new Uint8Array(32).fill(1))}));
import {approvedCalendarWalks,calendarContentImage,calendarEventSource,matchesCalendar,matchesInitialCalendar,matchesOrganizerCalendar,decodeCalendarLink,calendarNevent,initialCalendarHero,retainedCalendarHero,type CalendarWalk} from "./calendar-records";
import {createApprovedCalendarEvent,createInitialCalendarProposal,createOrganizerCalendarEvent} from "./calendar-event";
import type {ApprovalRecord} from "./city-records";
const city={cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",slug:"radom",cityName:"Radom",description:"Friday walk",startAt:"2026-10-02T15:00:00Z",meetingPoint:{description:"Square",latitude:51.4,longitude:21.1},heroImageUrl:"https://example.com/hero.jpg"};
const event=(id:string,time:number):Event=>({id:id.repeat(64),created_at:time,pubkey:"a".repeat(64),sig:"",kind:30304,tags:[],content:""});
const revision={event:event("a",1),city};
const approval:ApprovalRecord={event:event("b",2),approval:{cityId:city.cityId,cityRevisionId:revision.event.id,status:"approved"}};
const walk:CalendarWalk={revision,approval};
describe("calendar approval selection",()=>{
 it("retains signed occurrences using the original or approved image across profile updates",()=>{
  const raw={...revision,city:{...city,heroImageUrl:undefined}};
  const reviewed={...approval,approval:{...approval.approval,heroImageUrl:"https://example.com/approved.webp"}};
  const [current]=approvedCalendarWalks([raw],[reviewed]);
  const draft={id:`${city.cityId}:2026-10-02`,seriesId:city.cityId,localDate:"2026-10-02",localTime:"15:00",start:1790953200,end:1790956800,timeZone:"UTC",meetingPoint:city.meetingPoint};
  const key=new Uint8Array(32).fill(2);
  const original=finalizeEvent(createOrganizerCalendarEvent({revision:raw,approval:reviewed},draft),key);
  const presented=finalizeEvent(createOrganizerCalendarEvent(current,draft),key);
  expect(calendarEventSource(original,current)).not.toBeNull();
  expect(calendarEventSource(presented,current)).not.toBeNull();
  const next={event:event("c",3),city:{...city,description:"Updated"}};
  const nextApproval={event:event("d",4),approval:{...approval.approval,cityRevisionId:next.event.id}};
  const [updated]=approvedCalendarWalks([raw,next],[reviewed,nextApproval]);
  expect(calendarEventSource(original,updated)).not.toBeNull();
  expect(calendarEventSource(presented,updated)).not.toBeNull();
  const forged=finalizeEvent({...original,tags:original.tags.map(t=>t[3]==="city-approval"?["e","f".repeat(64),"","city-approval"]:t)},key);
  expect(calendarEventSource(forged,updated)).toBeNull();
 });
 it("recovers the first approval image after a later imageless profile approval without using pending images",()=>{
  const key=new Uint8Array(32).fill(2),author=getPublicKey(key);
  const noImage={...city,heroImageUrl:undefined};
  const initial=finalizeEvent(createInitialCalendarProposal(noImage,"UTC"),key);
  const firstRevision={event:{...event("c",1),pubkey:author},city:noImage};
  const firstApproval:ApprovalRecord={event:event("d",2),approval:{cityId:city.cityId,cityRevisionId:firstRevision.event.id,initialEventId:initial.id,status:"approved",heroImageUrl:"https://example.com/approved.webp"}};
  const currentRevision={event:{...event("e",3),pubkey:author},city:{...noImage,description:"Retention test C"}};
  const currentApproval:ApprovalRecord={event:event("f",4),approval:{cityId:city.cityId,cityRevisionId:currentRevision.event.id,status:"approved"}};
  const pendingRevision={event:event("9",5),city:{...city,heroImageUrl:"https://example.com/pending.webp"}};
  const [selected]=approvedCalendarWalks([firstRevision,currentRevision,pendingRevision],[firstApproval,currentApproval]);
  expect(initialCalendarHero(initial,selected)).toBe("https://example.com/approved.webp");
  expect(retainedCalendarHero(selected)).toBe("https://example.com/approved.webp");
  expect(selected.revision.city.heroImageUrl).toBeUndefined();
  expect(selected.revision.city.description).toBe("Retention test C");
  const other=finalizeEvent(createInitialCalendarProposal({...noImage,description:"Different walk"},"UTC"),key);
  expect(initialCalendarHero(other,selected)).toBeUndefined();
  expect(initialCalendarHero(initial,{...selected,initialRelease:undefined})).toBeUndefined();
  expect(retainedCalendarHero({...selected,approvedSources:undefined})).toBeUndefined();
 });
 it("retains approval after rejection of another revision",()=>{
  const rejection:ApprovalRecord={event:event("c",3),approval:{...approval.approval,cityRevisionId:"d".repeat(64),status:"rejected"}};
  expect(approvedCalendarWalks([revision],[approval,rejection])).toEqual([walk]);
 });
 it("applies the complete approved public presentation to city routes",()=>{
  const presented:ApprovalRecord={...approval,approval:{...approval.approval,slug:"wuerzburg",aliases:["wurzburg"],heroImageUrl:"https://example.com/approved.webp"}};
  const [selected]=approvedCalendarWalks([revision],[presented]);
  expect(selected.revision.city).toMatchObject({slug:"wuerzburg",aliases:["wurzburg"],heroImageUrl:"https://example.com/approved.webp"});
 });
 it("does not fall back after revocation or missing newly approved revision",()=>{
  expect(approvedCalendarWalks([revision],[approval,{event:event("c",3),approval:{...approval.approval,status:"revoked"}}])).toEqual([]);
  expect(approvedCalendarWalks([revision],[approval,{event:event("c",3),approval:{...approval.approval,cityRevisionId:"d".repeat(64)}}])).toEqual([]);
 });
 it("requires revision to belong to the approved city",()=>{
  expect(approvedCalendarWalks([{...revision,city:{...city,cityId:"other"}}],[approval])).toEqual([]);
 });
 it("keeps exact first-walk approval provenance after a later profile approval",()=>{
  const organizerKey=new Uint8Array(32).fill(2),organizer=getPublicKey(organizerKey),initial=finalizeEvent(createInitialCalendarProposal(city,"UTC"),organizerKey);
  const firstRevision={event:{...event("c",1),pubkey:organizer},city};
  const firstApproval:ApprovalRecord={event:event("d",2),approval:{cityId:city.cityId,cityRevisionId:firstRevision.event.id,initialEventId:initial.id,status:"approved"}};
  const currentRevision={event:{...event("e",3),pubkey:organizer},city:{...city,description:"Updated city profile"}};
  const currentApproval:ApprovalRecord={event:event("f",4),approval:{cityId:city.cityId,cityRevisionId:currentRevision.event.id,status:"approved"}};
  const selected=approvedCalendarWalks([firstRevision,currentRevision],[firstApproval,currentApproval]);
  expect(selected).toHaveLength(1);
  expect(selected[0].revision.event.id).toBe(currentRevision.event.id);
  expect(selected[0].initialRelease?.revision.event.id).toBe(firstRevision.event.id);
  expect(matchesInitialCalendar(initial,selected[0])).toBe(true);
 });
});
describe("calendar event verification and links",()=>{
 const signed=()=>finalizeEvent(createApprovedCalendarEvent(city,revision.event.id,approval.event.id),new Uint8Array(32).fill(1));
 it("accepts exact signed snapshot and rejects changed content, tags and authors",()=>{
  expect(matchesCalendar(signed(),walk)).toBe(true);
  const altered:Event=JSON.parse(JSON.stringify(signed()));altered.content="tampered";
  expect(matchesCalendar(altered,walk)).toBe(false);
  const template=createApprovedCalendarEvent(city,revision.event.id,approval.event.id);template.tags.push(["title","extra"]);
  expect(matchesCalendar(finalizeEvent(template,new Uint8Array(32).fill(1)),walk)).toBe(false);
  expect(matchesCalendar(finalizeEvent(createApprovedCalendarEvent(city,revision.event.id,approval.event.id),new Uint8Array(32).fill(2)),walk)).toBe(false);
 });
 it("encodes an exact event ID and rejects malformed or wrong-type links",()=>{
  const e=signed(),encoded=calendarNevent(e,["wss://bitcoinwalk.example/","wss://one.example/","wss://two.example/","wss://ignored.example/"]);
  expect(decodeCalendarLink(encoded)).toBe(e.id);
  const decoded=nip19.decode(encoded);expect(decoded.type).toBe("nevent");if(decoded.type==="nevent")expect(decoded.data.relays).toEqual(["wss://bitcoinwalk.example/","wss://one.example/","wss://two.example/","wss://ignored.example/"]);
  expect(decodeCalendarLink("nevent1invalid")).toBeNull();
  expect(decodeCalendarLink(nip19.neventEncode({id:e.id,kind:1}))).toBeNull();
  expect(decodeCalendarLink(nip19.neventEncode({id:e.id,author:"f".repeat(64)}))).toBe(e.id);
 });
 it("accepts only managed per-walk image overrides",()=>{
  const key=new Uint8Array(32).fill(2),override="https://app-staging.bitcoinwalk.org/api/media/files/"+"b".repeat(64)+".webp";
  const occurrence={id:`${crypto.randomUUID()}:2026-10-02`,seriesId:crypto.randomUUID(),localDate:"2026-10-02",localTime:"10:00",timeZone:"Europe/Warsaw",start:1790935200,end:1790938800,meetingPoint:city.meetingPoint,heroImageUrl:override};
  expect(matchesOrganizerCalendar(finalizeEvent(createOrganizerCalendarEvent(walk,occurrence),key),walk)).toBe(true);
  expect(matchesOrganizerCalendar(finalizeEvent(createOrganizerCalendarEvent(walk,{...occurrence,heroImageUrl:"https://example.com/unmanaged.jpg"}),key),walk)).toBe(false);
 });
 it("accepts one managed inline walk image and rejects duplicates or external URLs",()=>{
  const key=new Uint8Array(32).fill(2),image="https://app-staging.bitcoinwalk.org/api/media/files/"+"c".repeat(64)+".webp";
  const occurrence={id:`${crypto.randomUUID()}:2026-10-02`,seriesId:crypto.randomUUID(),localDate:"2026-10-02",localTime:"10:00",timeZone:"Europe/Warsaw",start:1790935200,end:1790938800,meetingPoint:city.meetingPoint,contentImageUrl:image};
  const accepted=finalizeEvent(createOrganizerCalendarEvent(walk,occurrence),key);expect(calendarContentImage(accepted)).toBe(image);expect(matchesOrganizerCalendar(accepted,walk)).toBe(true);
  const external=finalizeEvent(createOrganizerCalendarEvent(walk,{...occurrence,contentImageUrl:"https://example.com/photo.jpg"}),key);expect(matchesOrganizerCalendar(external,walk)).toBe(false);
  const template=createOrganizerCalendarEvent(walk,occurrence);template.tags.push(["bitcoinwalk-content-image",image]);expect(matchesOrganizerCalendar(finalizeEvent(template,key),walk)).toBe(false);
 });
});
