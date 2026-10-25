import {describe,expect,it} from "vitest";
import {chronologically,sponsorWalkLabel} from "./sponsor-walk-display";

describe("sponsor walk display",()=>{
 it("uses an unambiguous city-local date",()=>{
  expect(sponsorWalkLabel("Madeira",Date.parse("2026-11-07T11:00:00Z")/1000,"Atlantic/Madeira")).toBe("Madeira · 7 Nov 2026, 11:00");
 });
 it("sorts by occurrence time instead of the rendered label",()=>{
  const rows=[14,21,28,7].map(day=>({start:Date.parse(`2026-11-${String(day).padStart(2,"0")}T11:00:00Z`)/1000,label:`Madeira · ${day} Nov 2026, 11:00`}));
  expect(chronologically(rows).map(row=>row.label)).toEqual(["Madeira · 7 Nov 2026, 11:00","Madeira · 14 Nov 2026, 11:00","Madeira · 21 Nov 2026, 11:00","Madeira · 28 Nov 2026, 11:00"]);
 });
});
