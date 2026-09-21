import {describe,expect,it} from "vitest";
import {finalizeEvent,type Event} from "nostr-tools";
import {createOrganizerCalendarEvent} from "../nostr/calendar-event";
import type {CalendarWalk} from "../nostr/calendar-records";
import {currentOrNextEvent,eventPageHref,managedCalendarEvents,paidCityForHost,paidCityForSlug} from "./event-routing";
import {cityDocumentSchema} from "./city";

const city=cityDocumentSchema.parse({cityId:"550e8400-e29b-41d4-a716-446655440000",slug:"warsaw",cityName:"Warsaw",startAt:"2026-01-01T10:00:00Z",description:"Walk",meetingPoint:{description:"Square",latitude:52.2,longitude:21},chatUrl:"https://chat.example",heroImageUrl:"https://image.example/a.jpg"});
const walk={revision:{city,event:{id:"a".repeat(64)} as Event},approval:{approval:{cityId:city.cityId,cityRevisionId:"a".repeat(64),status:"approved"},event:{id:"b".repeat(64)} as Event}} as CalendarWalk;
const signed=(id:string,start:number,end:number)=>finalizeEvent(createOrganizerCalendarEvent(walk,{id,seriesId:id.slice(0,36),start,end,localDate:id.slice(-10),localTime:"10:00",timeZone:"Europe/Warsaw",meetingPoint:city.meetingPoint}),new Uint8Array(32).fill(2));

describe("event root routing",()=>{
 it("keeps an active walk, then chooses the earliest future walk",()=>{
  const first=signed("123e4567-e89b-42d3-a456-426614174000:2026-09-21",100,3700),second=signed("123e4567-e89b-42d3-a456-426614174000:2026-09-28",5000,8600);
  expect(currentOrNextEvent(walk,[second,first],150)?.id).toBe(first.id);
  expect(currentOrNextEvent(walk,[second,first],3701)?.id).toBe(first.id);
  expect(currentOrNextEvent(walk,[second,first],7301)?.id).toBe(second.id);
 expect(currentOrNextEvent(walk,[second,first],12201)).toBeNull();
  expect(managedCalendarEvents(walk,[second,first],3701).map(row=>row.status)).toEqual(["grace","upcoming"]);
  expect(managedCalendarEvents(walk,[second,first],9000).map(row=>row.status)).toEqual(["grace","past"]);
 });
 it("recognizes only explicitly ready paid subdomains",()=>{
  const paid={x:{slug:"warsaw",featured:false,subdomainReady:true},y:{slug:"funchal",featured:false,subdomainReady:false}};
  expect(paidCityForHost("WARSAW.bitcoinwalk.org:443",paid)?.slug).toBe("warsaw");
  expect(paidCityForHost("funchal.bitcoinwalk.org",paid)).toBeNull();
  expect(paidCityForSlug("warsaw",paid)?.slug).toBe("warsaw");
  expect(eventPageHref("x","warsaw","nevent1abc",paid)).toBe("https://warsaw.bitcoinwalk.org/nevent1abc");
  expect(eventPageHref("z","radom","nevent1abc",paid)).toBe("/radom/nevent1abc");
 });
});
