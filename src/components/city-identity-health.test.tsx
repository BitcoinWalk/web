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
  expect(html).toContain("1 test identity");
  expect(html).toContain("Würzburg");
  expect(html).toContain("Open production city");
  expect(html).toContain("Review Madeira");
  expect(html).toContain("Open identity requests");
  expect(html).toContain("Recheck identities");
 });
 it("keeps evidence and future publishing separate in the checklist",()=>{
  const html=renderToStaticMarkup(createElement(CityIdentityHealthDetails,{row}));
  expect(html).toContain("Complete");
  expect(html).toContain("Dedicated city npub");
  expect(html).toContain("Future BW-118 scope");
  expect(html).toContain("No corrective action is required");
 });
});
