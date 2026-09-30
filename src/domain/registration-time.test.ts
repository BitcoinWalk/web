import {describe,expect,it} from "vitest";
import {HOUR_OPTIONS,MINUTE_OPTIONS,registrationLocalDateTime} from "./registration-time";

describe("registration date and time controls",()=>{
 it("offers separate 12-hour and quarter-hour choices",()=>{
  expect(HOUR_OPTIONS).toEqual(["1","2","3","4","5","6","7","8","9","10","11","12"]);
  expect(MINUTE_OPTIONS).toEqual(["00","15","30","45"]);
 });
 it("converts midnight, noon and afternoon without changing local-date semantics",()=>{
  expect(registrationLocalDateTime("2026-10-03","12","00","AM")).toBe("2026-10-03T00:00");
  expect(registrationLocalDateTime("2026-10-03","12","00","PM")).toBe("2026-10-03T12:00");
  expect(registrationLocalDateTime("2026-10-03","3","45","PM")).toBe("2026-10-03T15:45");
 });
 it("rejects invalid dates, times and non-quarter-hour values",()=>{
  expect(()=>registrationLocalDateTime("2026-02-30","10","00","AM")).toThrow("valid walk date");
  expect(()=>registrationLocalDateTime("2026-10-03","10","10","AM")).toThrow("15-minute");
 });
});
