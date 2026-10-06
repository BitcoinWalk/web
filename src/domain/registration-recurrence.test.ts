import {describe,expect,it} from "vitest";
import {registrationSeriesDates,registrationSeriesStarts} from "./registration-recurrence";

describe("registration recurrence",()=>{
 it("creates eight weekly or fortnightly dates and one non-repeating date",()=>{
  expect(registrationSeriesDates("2026-10-10","weekly")).toHaveLength(8);
  expect(registrationSeriesDates("2026-10-10","weekly").at(-1)).toBe("2026-11-28");
  expect(registrationSeriesDates("2026-10-10","fortnightly")[1]).toBe("2026-10-24");
  expect(registrationSeriesDates("2026-10-10","none")).toEqual(["2026-10-10"]);
 });
 it("keeps the selected date first and applies a custom weekday and interval",()=>{
  expect(registrationSeriesDates("2026-10-10","custom",3,3).slice(0,3)).toEqual(["2026-10-10","2026-10-14","2026-11-04"]);
 });
 it("turns each local date into an absolute start",()=>{
  expect(registrationSeriesStarts("2026-10-10T10:15",["2026-10-10","2026-10-17"])).toHaveLength(2);
 });
});
