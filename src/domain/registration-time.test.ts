import {describe,expect,it} from "vitest";
import {HOUR_OPTIONS,MINUTE_OPTIONS,registrationLocalDateTime} from "./registration-time";

describe("registration date and time controls",()=>{
 it("accepts 24-hour times without changing the selected date",()=>{
  for(const hour of ["00","12","15","23"])expect(registrationLocalDateTime("2027-12-18",hour,"30")).toBe(`2027-12-18T${hour}:30`);
  expect(()=>registrationLocalDateTime("2027-12-18","24","00")).toThrow("00 to 23");
 });
 it("offers separate 12-hour and single-minute choices",()=>{
  expect(HOUR_OPTIONS).toEqual(["1","2","3","4","5","6","7","8","9","10","11","12"]);
  expect(MINUTE_OPTIONS).toHaveLength(60);
  expect(MINUTE_OPTIONS[0]).toBe("00");expect(MINUTE_OPTIONS[59]).toBe("59");
 });
 it("converts midnight, noon and afternoon without changing local-date semantics",()=>{
  expect(registrationLocalDateTime("2026-10-03","12","00","AM")).toBe("2026-10-03T00:00");
  expect(registrationLocalDateTime("2026-10-03","12","00","PM")).toBe("2026-10-03T12:00");
  expect(registrationLocalDateTime("2026-10-03","3","45","PM")).toBe("2026-10-03T15:45");
 });
 it("allows any minute and pads single-digit input",()=>{
  expect(registrationLocalDateTime("2026-10-03","10","17","AM")).toBe("2026-10-03T10:17");
  expect(registrationLocalDateTime("2026-10-03","10","7","AM")).toBe("2026-10-03T10:07");
 });
 it("rejects invalid dates and out-of-range minutes",()=>{
  expect(()=>registrationLocalDateTime("2026-02-30","10","00","AM")).toThrow("valid walk date");
  expect(()=>registrationLocalDateTime("2026-10-03","10","60","AM")).toThrow("00 to 59");
  expect(()=>registrationLocalDateTime("2026-10-03","10","-1","AM")).toThrow();
  expect(()=>registrationLocalDateTime("2026-10-03","10","","AM")).toThrow();
 });
});
