import {describe,it,expect} from "vitest";
import {approvedDirectory,directoryWithWalkSchedule,filterDirectory,directoryImage,directoryImageCandidates} from "./directory";
import type {CityRevision,ApprovalRecord} from "../nostr/city-records";
const cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f";
const revision=(id:string,slug="radom"):CityRevision=>({event:{id,created_at:1} as CityRevision["event"],city:{cityId,slug,cityName:"Radom",description:"Walk",startAt:"2026-10-03T10:00:00Z",meetingPoint:{description:"Rynek",latitude:51.4,longitude:21.1},heroImageUrl:"https://example.com/hero.jpg",sponsor:{name:"Example",logoUrl:"https://example.com/logo.png"}}});
const decision=(id:string,status:"approved"|"rejected"|"revoked",time:number):ApprovalRecord=>({event:{id:String(time),created_at:time} as ApprovalRecord["event"],approval:{cityId,cityRevisionId:id,status}});
describe("approved city directory",()=>{
 it("lists approved revisions only, retaining one during pending or rejected edits",()=>{
  const a=revision("a"),b=revision("b");
  expect(approvedDirectory([a,b],[],{})).toEqual([]);
  expect(approvedDirectory([a,b],[decision("a","approved",1),decision("b","rejected",2)],{})[0].city).toBe(a.city);
 });
 it("omits revoked and missing approved revisions",()=>{
  expect(approvedDirectory([revision("a")],[decision("a","approved",1),decision("a","revoked",2)],{})).toEqual([]);
  expect(approvedDirectory([revision("a")],[decision("b","approved",1)],{})).toEqual([]);
 });
 it("does not infer paid status from sponsors",()=>{
  expect(approvedDirectory([revision("a")],[decision("a","approved",1)],{})[0]).toMatchObject({tier:"free",featured:false,href:"/radom"});
 });
 it("shows the landscape selected during approval when the organizer supplied none",()=>{
  const item=revision("a");delete item.city.heroImageUrl;
  const approved=decision("a","approved",1);approved.approval.heroImageUrl="https://app-staging.bitcoinwalk.org/api/media/files/generated.webp";
  expect(approvedDirectory([item],[approved],{})[0].city.heroImageUrl).toBe(approved.approval.heroImageUrl);
 });
 it("marks paid identity while keeping the canonical website path",()=>{
  const a=[revision("a")],d=[decision("a","approved",1)];
  expect(approvedDirectory(a,d,{[cityId]:{slug:"radom",featured:true,subdomainReady:false}})[0]).toMatchObject({featured:true,tier:"paid",href:"/radom"});
  expect(approvedDirectory(a,d,{[cityId]:{slug:"radom",featured:true,subdomainReady:true}})[0].href).toBe("/radom");
  expect(approvedDirectory(a,d,{[cityId]:{slug:"other",featured:true,subdomainReady:true}})[0].tier).toBe("free");
 });
 it("searches city and meeting point without case sensitivity",()=>{
  const rows=approvedDirectory([revision("a")],[decision("a","approved",1)],{});
  expect(filterDirectory(rows," RADOM ")).toHaveLength(1);
  expect(filterDirectory(rows,"rynek")).toHaveLength(1);
 expect(filterDirectory(rows,"madeira")).toHaveLength(0);
 });
 it("finds a city through approved alternative names",()=>{
  const warsaw={...revision("a"),city:{...revision("a").city,cityName:"Warszawa",aliases:["Warsaw","Warschau","Varsovia"]}};
  const rows=approvedDirectory([warsaw],[decision("a","approved",1)],{});
  expect(filterDirectory(rows,"warsaw")).toHaveLength(1);
  expect(filterDirectory(rows,"WARSCHAU")).toHaveLength(1);
 });
 it("retains every approved city and uses exact active or upcoming occurrence details",()=>{
  const rows=approvedDirectory([revision("a")],[decision("a","approved",1)],{}),point={description:"New meeting point",latitude:51.41,longitude:21.11},heroImageUrl="https://bitcoinwalk.org/api/media/files/"+"a".repeat(64)+".webp";
  expect(directoryWithWalkSchedule(rows,new Map([[cityId,{start:1_800_000_000,status:"upcoming",meetingPoint:point,heroImageUrl}]]))).toMatchObject([{hasUpcomingWalk:true,city:{startAt:"2027-01-15T08:00:00.000Z",meetingPoint:point,heroImageUrl}}]);
  for(const status of ["grace","past"] as const)expect(directoryWithWalkSchedule(rows,new Map([[cityId,{start:1_800_000_000,status,meetingPoint:point}]]))).toEqual(rows);
  expect(directoryWithWalkSchedule(rows,new Map())).toEqual(rows);
 });
 it("does not emit unsafe image URLs",()=>{
  expect(directoryImage("javascript:alert(1)")).toBeUndefined();
  expect(directoryImage("https://user:pass@example.com/a")).toBeUndefined();
  expect(directoryImage("https://example.com/a")).toBe("https://example.com/a");
 });
 it("prefers the current environment copy of managed city artwork",()=>{
  const hash="a".repeat(64),staging=`https://app-staging.bitcoinwalk.org/api/media/files/${hash}.webp`;
  expect(directoryImageCandidates(staging)).toEqual([`/api/media/files/${hash}.webp`,staging]);
  expect(directoryImageCandidates("/brand/campaigns/lugano-planb-background.webp")).toEqual(["/brand/campaigns/lugano-planb-background.webp"]);
  expect(directoryImageCandidates("https://images.example/hannover.webp")).toEqual(["https://images.example/hannover.webp"]);
  expect(directoryImageCandidates("javascript:alert(1)")).toEqual([]);
 });
});
