import { describe, expect, it } from "vitest";
import { DEFAULT_WEEKDAY, DEFAULT_OCCURRENCES, scheduleOccurrences, localStart, occurrenceDays, type WalkSchedule } from "./walk-schedule";
const base: WalkSchedule = { seriesId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", firstDate: "2026-10-01", localTime: "10:00", timeZone: "America/Chicago", frequency: "weekly", weekday: DEFAULT_WEEKDAY, count: DEFAULT_OCCURRENCES, durationMinutes: 60 };
const now = Date.parse("2026-09-20T00:00:00Z");
describe("organizer recurrence", () => {
  it("defaults to eight Saturdays, starting on or after the selected date", () => {
    expect(DEFAULT_WEEKDAY).toBe(6);
    const dates = scheduleOccurrences(base, now);
    expect(dates).toHaveLength(8);
    expect(dates[0].localDate).toBe("2026-10-03");
    expect(dates.every(o => new Date(`${o.localDate}T00:00Z`).getUTCDay() === 6)).toBe(true);
  });
  it("keeps Memphis at 10am across fall DST", () => {
    const dates = scheduleOccurrences(base, now);
    expect(new Date(dates[4].start * 1000).toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(new Date(dates[5].start * 1000).toISOString()).toBe("2026-11-07T16:00:00.000Z");
  });
  it("keeps Memphis at 10am across spring DST", () => {
    const dates = scheduleOccurrences({ ...base, firstDate: "2027-03-06", count: 3 }, Date.parse("2027-03-01"));
    expect(dates.map(o => new Date(o.start * 1000).getUTCHours())).toEqual([16, 16, 15]);
  });
  it("lets the organizer switch to Friday and every other week", () => {
    expect(scheduleOccurrences({ ...base, weekday: 5, frequency: "fortnightly", count: 3 }, now).map(o => o.localDate)).toEqual(["2026-10-02", "2026-10-16", "2026-10-30"]);
  });
  it("uses the exact chosen date for a one-off, regardless of weekday", () => {
    expect(scheduleOccurrences({ ...base, frequency: "once" }, now).map(o => o.localDate)).toEqual(["2026-10-01"]);
  });
  it("skips dates without changing the rest of the series IDs", () => {
    const all = scheduleOccurrences(base, now);
    const skipped = scheduleOccurrences({ ...base, excludedDates: ["2026-10-10"] }, now);
    expect(skipped).toEqual(all.filter(o => o.localDate !== "2026-10-10"));
    expect(new Set(all.map(o => o.id)).size).toBe(8);
    expect(scheduleOccurrences(base, now)).toEqual(all);
  });
  it("rejects nonexistent and ambiguous DST local times", () => {
    expect(() => localStart("2027-03-14", "02:30", "America/Chicago")).toThrow("does not exist");
    expect(() => localStart("2026-11-01", "01:30", "America/Chicago")).toThrow("occurs twice");
  });
  it("handles non-hour timezone offsets", () => {
    expect(new Date(localStart("2026-10-03", "10:00", "Asia/Kathmandu") * 1000).toISOString()).toBe("2026-10-03T04:15:00.000Z");
  });
  it("validates dates, zones, count, duration, past dates and horizon", () => {
    for (const patch of [{ firstDate: "2026-02-30" }, { timeZone: "Memphis" }, { localTime: "24:00" }, { count: 27 }, { count: 0 }, { count: 1.5 }, { weekday: 7 }, { durationMinutes: 0 }, { firstDate: "2026-09-01", frequency: "once" as const }, { firstDate: "2027-05-01" }]) expect(() => scheduleOccurrences({ ...base, ...patch }, now)).toThrow();
  });
  it("covers UTC midnight without including an exclusive-end extra day", () => {
    expect(occurrenceDays(86300, 86500)).toEqual(["0", "1"]);
    expect(occurrenceDays(86300, 86400)).toEqual(["0"]);
  });
});
