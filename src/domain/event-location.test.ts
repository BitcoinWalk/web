import { describe, it, expect } from "vitest";
import { withEventMeetingPoint } from "./event-location";
import type { WalkOccurrence } from "./walk-schedule";

const occurrences: WalkOccurrence[] = ["one", "two"].map(id => ({ id, seriesId: "series", localDate: "2026-10-03", localTime: "10:00", timeZone: "America/Chicago", start: 1791039600, end: 1791043200 }));
describe("event-owned meeting points", () => {
  it("snapshots the initial meeting point independently for each occurrence", () => {
    const cityDefault = { description: " City square ", latitude: 35.15, longitude: -90.05 };
    const result = withEventMeetingPoint(occurrences, cityDefault);
    expect(result[0].meetingPoint.description).toBe("City square");
    result[0].meetingPoint.latitude = 36;
    expect(result[1].meetingPoint.latitude).toBe(35.15);
    expect(cityDefault.latitude).toBe(35.15);
    expect(cityDefault.description).toBe(" City square ");
    expect(occurrences[0]).not.toHaveProperty("meetingPoint");
  });
  it("retains edited event details without changing date identity or city timezone", () => {
    const point = { description: "Cafe entrance", latitude: 35.1, longitude: -90.1 };
    const result = withEventMeetingPoint(occurrences, point);
    expect(result.map(o => o.id)).toEqual(["one", "two"]);
    expect(result[0]).toMatchObject({ timeZone: "America/Chicago", meetingPoint: point });
  });
  it("rejects missing or invalid locations", () => {
    for (const point of [null, { description: " ", latitude: 1, longitude: 2 }, { description: "Square", latitude: 91, longitude: 2 }, { description: "Square", latitude: 1, longitude: NaN }]) expect(() => withEventMeetingPoint(occurrences, point)).toThrow("meeting-point");
  });
});
