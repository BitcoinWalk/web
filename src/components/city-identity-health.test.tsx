import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {CityIdentityHealthDetails,CityIdentityHealthOverview} from "./city-identity-health";
import type {CityIdentityHealth} from "../server/pro-city-identity-health";

const row:CityIdentityHealth={cityId:"city",cityName:"Madeira",tier:"pro",status:"complete",checkedAt:100,lastVerifiedAt:90,checks:[
 {key:"identity",label:"Dedicated city npub",state:"pass",detail:"Verified."},
 {key:"publishing",label:"City-signed publication",state:"future",detail:"Future BW-118 scope."},
]};

describe("city identity health UI",()=>{
 it("summarizes complete Pro cities and exposes a recheck action",()=>{
  const pilot={...row,cityId:"test",cityName:"Islamabad",tier:"pilot" as const};
  const html=renderToStaticMarkup(createElement(CityIdentityHealthOverview,{rows:[row,pilot],busy:false,onRecheck:()=>{}}));
  expect(html).toContain("1 of 1 Pro city complete");
  expect(html).toContain("1 test identity");
  expect(html).toContain("Recheck identities");
 });
 it("keeps evidence and future publishing separate in the checklist",()=>{
  const html=renderToStaticMarkup(createElement(CityIdentityHealthDetails,{row}));
  expect(html).toContain("Complete");
  expect(html).toContain("Dedicated city npub");
  expect(html).toContain("Future BW-118 scope");
 });
});
