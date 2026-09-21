import {describe,it,expect,vi} from "vitest";
import {finalizeEvent,getPublicKey,nip19,type Event} from "nostr-tools";
vi.mock("./authority",()=>({isSuperAdmin:(key:string)=>key===getPublicKey(new Uint8Array(32).fill(1)),SUPER_ADMIN_PUBKEY:getPublicKey(new Uint8Array(32).fill(1))}));
import {approvedCalendarWalks,matchesCalendar,decodeCalendarLink,calendarNevent,type CalendarWalk} from "./calendar-records";
import {createApprovedCalendarEvent} from "./calendar-event";
import type {ApprovalRecord} from "./city-records";
const city={cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",slug:"radom",cityName:"Radom",description:"Friday walk",startAt:"2026-10-02T15:00:00Z",meetingPoint:{description:"Square",latitude:51.4,longitude:21.1},heroImageUrl:"https://example.com/hero.jpg"};
const event=(id:string,time:number):Event=>({id:id.repeat(64),created_at:time,pubkey:"a".repeat(64),sig:"",kind:30304,tags:[],content:""});
const revision={event:event("a",1),city};
const approval:ApprovalRecord={event:event("b",2),approval:{cityId:city.cityId,cityRevisionId:revision.event.id,status:"approved"}};
const walk:CalendarWalk={revision,approval};
describe("calendar approval selection",()=>{
 it("retains approval after rejection of another revision",()=>{
  const rejection:ApprovalRecord={event:event("c",3),approval:{...approval.approval,cityRevisionId:"d".repeat(64),status:"rejected"}};
  expect(approvedCalendarWalks([revision],[approval,rejection])).toEqual([walk]);
 });
 it("does not fall back after revocation or missing newly approved revision",()=>{
  expect(approvedCalendarWalks([revision],[approval,{event:event("c",3),approval:{...approval.approval,status:"revoked"}}])).toEqual([]);
  expect(approvedCalendarWalks([revision],[approval,{event:event("c",3),approval:{...approval.approval,cityRevisionId:"d".repeat(64)}}])).toEqual([]);
 });
 it("requires revision to belong to the approved city",()=>{
  expect(approvedCalendarWalks([{...revision,city:{...city,cityId:"other"}}],[approval])).toEqual([]);
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
  const e=signed();expect(decodeCalendarLink(calendarNevent(e,["wss://example.com"]))).toBe(e.id);
  expect(decodeCalendarLink("nevent1invalid")).toBeNull();
  expect(decodeCalendarLink(nip19.neventEncode({id:e.id,kind:1}))).toBeNull();
  expect(decodeCalendarLink(nip19.neventEncode({id:e.id,author:"f".repeat(64)}))).toBe(e.id);
 });
});
