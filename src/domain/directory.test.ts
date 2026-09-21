import {describe,it,expect} from "vitest";
import {approvedDirectory,filterDirectory,directoryImage} from "./directory";
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
 it("requires matching paid identity and only routes to a ready subdomain",()=>{
  const a=[revision("a")],d=[decision("a","approved",1)];
  expect(approvedDirectory(a,d,{[cityId]:{slug:"radom",featured:true,subdomainReady:false}})[0]).toMatchObject({featured:true,tier:"paid",href:"/radom"});
  expect(approvedDirectory(a,d,{[cityId]:{slug:"radom",featured:true,subdomainReady:true}})[0].href).toBe("https://radom.bitcoinwalk.org");
  expect(approvedDirectory(a,d,{[cityId]:{slug:"other",featured:true,subdomainReady:true}})[0].tier).toBe("free");
 });
 it("searches city and meeting point without case sensitivity",()=>{
  const rows=approvedDirectory([revision("a")],[decision("a","approved",1)],{});
  expect(filterDirectory(rows," RADOM ")).toHaveLength(1);
  expect(filterDirectory(rows,"rynek")).toHaveLength(1);
  expect(filterDirectory(rows,"madeira")).toHaveLength(0);
 });
 it("does not emit unsafe image URLs",()=>{
  expect(directoryImage("javascript:alert(1)")).toBeUndefined();
  expect(directoryImage("https://user:pass@example.com/a")).toBeUndefined();
  expect(directoryImage("https://example.com/a")).toBe("https://example.com/a");
 });
});
