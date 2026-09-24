import {describe,it,expect} from "vitest";
import {createApprovedCalendarEvent,createInitialCalendarProposal} from "./calendar-event";
const city={cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",slug:"radom",cityName:"Radom",description:"An approved Friday walk",startAt:"2026-10-02T15:00:00Z",meetingPoint:{description:"Square",latitude:51.4,longitude:21.1},heroImageUrl:"https://example.com/hero.jpg"};
describe("approved calendar publication",()=>{
 it("builds an organizer-signed first walk proposal without pretending it is approved",()=>{
  const event=createInitialCalendarProposal(city,"Europe/Warsaw");
  expect(event.tags).toContainEqual(["bitcoinwalk","initial-proposal-v1"]);
  expect(event.tags).toContainEqual(["start_tzid","Europe/Warsaw"]);
  expect(event.tags.find(tag=>tag[0]==="d")?.[1]).toBe(`${city.cityId}:2026-10-02`);
  expect(event.tags.some(tag=>tag[0]==="e")).toBe(false);
 });
 it("binds the exact revision and approval, with required time-based tags",()=>{
  const e=createApprovedCalendarEvent(city,"a".repeat(64),"b".repeat(64));
  const start=Math.floor(new Date(city.startAt).getTime()/1000);
  expect(e.kind).toBe(31923);expect(e.content).toBe(city.description);
  expect(e.tags).toContainEqual(["start",String(start)]);
  expect(e.tags).toContainEqual(["D",String(Math.floor(start/86400))]);
  expect(e.tags).toContainEqual(["e","a".repeat(64),"","city-revision"]);
  expect(e.tags).toContainEqual(["e","b".repeat(64),"","city-approval"]);
  expect(e.tags).toContainEqual(["i",city.cityId]);
 });
 it("keeps the same calendar address for rescheduling the current walk",()=>{
  const before=createApprovedCalendarEvent(city,"a".repeat(64),"b".repeat(64));
  const after=createApprovedCalendarEvent({...city,startAt:"2026-10-04T15:00:00Z"},"c".repeat(64),"d".repeat(64));
  expect(before.tags.find(t=>t[0]==="d")).toEqual(after.tags.find(t=>t[0]==="d"));
  expect(before.tags.find(t=>t[0]==="start")).not.toEqual(after.tags.find(t=>t[0]==="start"));
 });
 it("rejects missing source IDs or an invalid date",()=>{
  expect(()=>createApprovedCalendarEvent(city,"","b".repeat(64))).toThrow();
  expect(()=>createApprovedCalendarEvent({...city,startAt:"invalid"},"a".repeat(64),"b".repeat(64))).toThrow();
 });
});
