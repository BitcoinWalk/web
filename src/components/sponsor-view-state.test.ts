import {describe,expect,it} from "vitest";
import {sponsorViewUrl} from "./sponsor-view-state";

describe("sponsor view URL state",()=>{
 it("preserves unrelated safe context while changing a view",()=>{
  expect(sponsorViewUrl("https://bitcoinwalk.org/admin/sponsor?tab=payments&status=next#artwork","status","past","all")).toBe("/admin/sponsor?tab=payments&status=past#artwork");
 });
 it("removes defaults instead of filling the canonical route with noise",()=>{
  expect(sponsorViewUrl("https://bitcoinwalk.org/admin/sponsor?tab=payments&status=past","tab","sponsors","sponsors")).toBe("/admin/sponsor?status=past");
 });
});
