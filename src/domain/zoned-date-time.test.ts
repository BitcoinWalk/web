import {describe,expect,it} from "vitest";
import {sponsorshipDateTimeInput,sponsorshipEpoch,sponsorshipWindowSummary} from "./zoned-date-time";

describe("timezone-safe sponsorship dates",()=>{
 it.each([
  ["UTC","2026-10-17T11:30:00",1792236600],
  ["Atlantic/Madeira","2026-10-17T11:30:00",1792233000],
  ["Europe/Warsaw","2026-10-17T11:30:00",1792229400],
  ["Europe/Warsaw","2026-12-17T11:30:37",1797503437],
 ] as const)("round trips an exact %s epoch",(zone,input,epoch)=>{
  expect(sponsorshipEpoch(input,zone)).toBe(epoch);
  expect(sponsorshipDateTimeInput(epoch,zone)).toBe(input);
 });
 it("rejects the Warsaw spring DST gap",()=>expect(()=>sponsorshipEpoch("2026-03-29T02:30:00","Europe/Warsaw")).toThrow("does not exist"));
 it("rejects the Warsaw autumn DST overlap",()=>expect(()=>sponsorshipEpoch("2026-10-25T02:30:00","Europe/Warsaw")).toThrow("occurs twice"));
 it.each([
  ["Atlantic/Madeira","2026-03-29T00:30:00","2026-03-29T00:30:00Z"],
  ["Atlantic/Madeira","2026-03-29T02:30:00","2026-03-29T01:30:00Z"],
  ["Europe/Warsaw","2026-03-29T01:30:00","2026-03-29T00:30:00Z"],
  ["Europe/Warsaw","2026-03-29T03:30:00","2026-03-29T01:30:00Z"],
 ] as const)("round trips %s immediately around its DST boundary",(zone,input,instant)=>{
  const epoch=Date.parse(instant)/1000;
  expect(sponsorshipEpoch(input,zone)).toBe(epoch);
  expect(sponsorshipDateTimeInput(epoch,zone)).toBe(input);
 });
 it("rejects Madeira's spring gap and autumn overlap",()=>{
  expect(()=>sponsorshipEpoch("2026-03-29T01:30:00","Atlantic/Madeira")).toThrow("does not exist");
  expect(()=>sponsorshipEpoch("2026-10-25T01:30:00","Atlantic/Madeira")).toThrow("occurs twice");
 });
 it("rejects invalid dates and unsupported zones explicitly",()=>{
  expect(()=>sponsorshipEpoch("2026-02-30T10:00:00","UTC")).toThrow("valid sponsorship date");
  expect(()=>sponsorshipEpoch("2026-10-17T10:00:00","Not/AZone")).toThrow("not supported");
 });
 it("labels confirmation copy with the selected timezone",()=>expect(sponsorshipWindowSummary(1792229400,undefined,"Europe/Warsaw")).toContain("Europe/Warsaw"));
});
