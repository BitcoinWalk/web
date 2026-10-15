import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=()=>readFileSync("src/components/city-moderation.tsx","utf8");

describe("awaits-change cleanup",()=>{
 it("requires payment inventory and signed per-city archive read-back",()=>{
  const page=source();
  expect(page).toContain("Archive eligible Awaits change test cities");
  expect(page).toContain("if(!paymentInventoryReady)");
  expect(page).toContain("paidCityIds.has(row.revision.city.cityId)");
  expect(page).toContain("createNeedsChangesArchiveDecision(latest)");
  expect(page).toContain("archivedCityIds(readback.approvals).has(row.revision.city.cityId)");
 });
});
