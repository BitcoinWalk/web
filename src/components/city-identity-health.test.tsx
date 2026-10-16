import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {CityIdentityHealthDetails,CityIdentityHealthOverview} from "./city-identity-health";
import type {CityIdentityHealth} from "../server/pro-city-identity-health";

const row:CityIdentityHealth={cityId:"city",cityName:"Madeira",slug:"madeira",availableInEnvironment:true,tier:"pro",status:"complete",checkedAt:100,lastVerifiedAt:90,checks:[
 {key:"identity",label:"Dedicated city npub",state:"pass",detail:"Verified."},
 {key:"publishing",label:"City-signed publication",state:"future",detail:"Future BW-118 scope."},
]};

describe("city identity health UI",()=>{
 it("summarizes complete Pro cities and exposes a recheck action",()=>{
 const pilot={...row,cityId:"test",cityName:"Islamabad",tier:"pilot" as const};
  const missing={...row,cityId:"wuerzburg",cityName:"Würzburg",slug:"wuerzburg",availableInEnvironment:false,status:"not-configured" as const};
  const html=renderToStaticMarkup(createElement(CityIdentityHealthOverview,{rows:[row,pilot,missing],busy:false,onRecheck:()=>{},onReview:()=>{}}));
  expect(html).toContain("1 of 2 Pro cities complete");
  expect(html).not.toContain("Islamabad");
  expect(html).toContain("Paid Pro city");
  expect(html).toContain("Würzburg");
  expect(html).toContain("Open production city");
  expect(html).toContain("Review Madeira");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Recheck identities");
 });
 it("keeps evidence and future publishing separate in the checklist",()=>{
  const html=renderToStaticMarkup(createElement(CityIdentityHealthDetails,{row}));
  expect(html).toContain("Complete");
  expect(html).toContain("Dedicated city npub");
  expect(html).toContain("Future BW-118 scope");
  expect(html).toContain("No corrective action is required");
 });
 it("routes organizer-only identity work to a safe setup link",()=>{
  const missing={...row,status:"action-required" as const,checks:[
   {key:"identity" as const,label:"Dedicated city npub",state:"fail" as const,detail:"Missing."},
   {key:"recovery" as const,label:"Recovery acknowledgement",state:"fail" as const,detail:"Missing."},
  ]};
  const html=renderToStaticMarkup(createElement(CityIdentityHealthDetails,{row:missing}));
  expect(html).toContain("Copy host setup link");
  expect(html).toContain("/admin/my-cities?city=city#pro-city-services");
  expect(html).not.toContain("Review activation request");
 });
 it("routes a completed organizer proof to activation review",()=>{
  const pending={...row,status:"action-required" as const,checks:[
   {key:"identity" as const,label:"Dedicated city npub",state:"pass" as const,detail:"Ready."},
   {key:"recovery" as const,label:"Recovery acknowledgement",state:"pass" as const,detail:"Ready."},
   {key:"binding" as const,label:"City binding",state:"fail" as const,detail:"Pending."},
  ]};
  const html=renderToStaticMarkup(createElement(CityIdentityHealthDetails,{row:pending}));
  expect(html).toContain("Review activation request");
  expect(html).not.toContain("Copy host setup link");
 });
});
