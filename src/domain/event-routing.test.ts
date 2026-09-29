import {describe,expect,it} from "vitest";
import {finalizeEvent,type Event} from "nostr-tools";
import {createOrganizerCalendarEvent} from "../nostr/calendar-event";
import {approvedCalendarWalks,calendarEventSource,type CalendarWalk} from "../nostr/calendar-records";
import {reconcileOccurrences} from "./recurrence-reconciliation";
import {currentOrNextEvent,eventPageHref,managedCalendarEvents,paidCityForHost} from "./event-routing";
import {cityDocumentSchema} from "./city";

const city=cityDocumentSchema.parse({cityId:"550e8400-e29b-41d4-a716-446655440000",slug:"warsaw",cityName:"Warsaw",startAt:"2026-01-01T10:00:00Z",description:"Walk",meetingPoint:{description:"Square",latitude:52.2,longitude:21},chatUrl:"https://chat.example",heroImageUrl:"https://image.example/a.jpg"});
const walk={revision:{city,event:{id:"a".repeat(64)} as Event},approval:{approval:{cityId:city.cityId,cityRevisionId:"a".repeat(64),status:"approved"},event:{id:"b".repeat(64)} as Event}} as CalendarWalk;
const signed=(id:string,start:number,end:number)=>finalizeEvent(createOrganizerCalendarEvent(walk,{id,seriesId:id.slice(0,36),start,end,localDate:id.slice(-10),localTime:"10:00",timeZone:"Europe/Warsaw",meetingPoint:city.meetingPoint}),new Uint8Array(32).fill(2));

describe("event root routing",()=>{
 it("retains scheduled walks, dates and duplicate detection after approved city-profile changes",()=>{
  const old={revision:{...walk.revision,event:{...walk.revision.event,created_at:1}},approval:{...walk.approval,event:{...walk.approval.event,created_at:2}}};
  const revision={event:{...walk.revision.event,id:"c".repeat(64),created_at:3},city:{...city,description:"Updated city profile",heroImageUrl:"https://image.example/new.jpg",meetingPoint:{description:"New default",latitude:53,longitude:22}}};
  const approval={event:{...walk.approval.event,id:"d".repeat(64),created_at:4},approval:{...walk.approval.approval,cityRevisionId:revision.event.id}};
  const [current]=approvedCalendarWalks([old.revision,revision],[old.approval,approval]);
  const first=signed("123e4567-e89b-42d3-a456-426614174000:2026-09-21",100,3700),second=signed("123e4567-e89b-42d3-a456-426614174000:2026-09-28",10000,13600);
  expect(calendarEventSource(first,current)?.approval.event.id).toBe(old.approval.event.id);
  expect(currentOrNextEvent(current,[second,first],150)?.id).toBe(first.id);
  expect(currentOrNextEvent(current,[second,first],7301)?.id).toBe(second.id);
  const listed=managedCalendarEvents(current,[second,first],8000);
  expect(listed.map(item=>[item.event.id,item.status])).toEqual([[second.id,"upcoming"],[first.id,"past"]]);
  expect(listed.every(item=>item.meetingPoint.description==="Square")).toBe(true);
  const draft={id:"draft",seriesId:"series",start:10000,end:13600,localDate:"1970-01-01",localTime:"03:46",timeZone:"UTC",meetingPoint:city.meetingPoint};
  expect(reconcileOccurrences([draft],listed,"UTC",8000*1000).missing).toHaveLength(0);
  // Cancellation removes the event from authoritative reads: retained provenance
  // must not manufacture it or select it again.
  expect(managedCalendarEvents(current,[second],150).map(item=>item.event.id)).toEqual([second.id]);
  expect(currentOrNextEvent(current,[second],150)?.id).toBe(second.id);
  expect(currentOrNextEvent(current,[],150)).toBeNull();
 });
 it("does not accept missing, unapproved, mismatched, foreign-city or tampered historical sources",()=>{
  const signedEvent=signed("123e4567-e89b-42d3-a456-426614174000:2026-09-21",100,3700);
  const current:CalendarWalk={revision:{...walk.revision,event:{...walk.revision.event,id:"c".repeat(64)}},approval:{event:{...walk.approval.event,id:"d".repeat(64)},approval:{...walk.approval.approval,cityRevisionId:"c".repeat(64)}},approvedSources:[walk]};
  expect(managedCalendarEvents(current,[signedEvent],150)).toHaveLength(1);
  const invalid=[{...current,approvedSources:[]},{...current,approvedSources:[{...walk,approval:{...walk.approval,approval:{...walk.approval.approval,status:"rejected" as const}}}]},{...current,approvedSources:[{...walk,revision:{...walk.revision,city:{...city,cityId:crypto.randomUUID()}}}]},{...current,approvedSources:[{...walk,approval:{...walk.approval,approval:{...walk.approval.approval,cityRevisionId:"f".repeat(64)}}}]},{...current,approval:{...current.approval,approval:{...current.approval.approval,status:"revoked" as const}}}];
  for(const candidate of invalid){expect(currentOrNextEvent(candidate,[signedEvent],150)).toBeNull();expect(managedCalendarEvents(candidate,[signedEvent],150)).toEqual([]);}
  const tampered=JSON.parse(JSON.stringify(signedEvent));tampered.content="tampered";
  expect(managedCalendarEvents(current,[tampered],150)).toEqual([]);
 });
 it("keeps an active walk, then chooses the earliest future walk",()=>{
  const first=signed("123e4567-e89b-42d3-a456-426614174000:2026-09-21",100,3700),second=signed("123e4567-e89b-42d3-a456-426614174000:2026-09-28",5000,8600);
  expect(currentOrNextEvent(walk,[second,first],150)?.id).toBe(first.id);
  expect(currentOrNextEvent(walk,[second,first],3701)?.id).toBe(first.id);
  expect(currentOrNextEvent(walk,[second,first],7301)?.id).toBe(second.id);
 expect(currentOrNextEvent(walk,[second,first],12201)).toBeNull();
  expect(managedCalendarEvents(walk,[second,first],3701).map(row=>row.status)).toEqual(["grace","upcoming"]);
  expect(managedCalendarEvents(walk,[second,first],9000).map(row=>row.status)).toEqual(["grace","past"]);
 });
 it("uses paid subdomains only for legacy-host recognition while keeping public links canonical",()=>{
  const paid={x:{slug:"warsaw",featured:false,subdomainReady:true},y:{slug:"funchal",featured:false,subdomainReady:false}};
  expect(paidCityForHost("WARSAW.bitcoinwalk.org:443",paid)?.slug).toBe("warsaw");
  expect(paidCityForHost("funchal.bitcoinwalk.org",paid)).toBeNull();
  expect(eventPageHref("warsaw","nevent1abc")).toBe("/warsaw/nevent1abc");
  expect(eventPageHref("radom","nevent1abc")).toBe("/radom/nevent1abc");
 });
});
