import {describe,expect,it} from "vitest";
import {QUARTER_HOUR_OPTIONS,registrationLocalDateTime} from "./registration-time";

describe("registration date and time controls",()=>{
 it("offers every quarter hour in a 12-hour cycle",()=>{
  expect(QUARTER_HOUR_OPTIONS).toHaveLength(48);
  expect(QUARTER_HOUR_OPTIONS.slice(0,5)).toEqual(["12:00","12:15","12:30","12:45","1:00"]);
  expect(QUARTER_HOUR_OPTIONS.at(-1)).toBe("11:45");
 });
 it("converts midnight, noon and afternoon without changing local-date semantics",()=>{
  expect(registrationLocalDateTime("2026-10-03","12:00","AM")).toBe("2026-10-03T00:00");
  expect(registrationLocalDateTime("2026-10-03","12:00","PM")).toBe("2026-10-03T12:00");
  expect(registrationLocalDateTime("2026-10-03","3:45","PM")).toBe("2026-10-03T15:45");
 });
 it("rejects invalid dates, times and non-quarter-hour values",()=>{
  expect(()=>registrationLocalDateTime("2026-02-30","10:00","AM")).toThrow("valid walk date");
  expect(()=>registrationLocalDateTime("2026-10-03","10:10","AM")).toThrow("15-minute");
 });
});
