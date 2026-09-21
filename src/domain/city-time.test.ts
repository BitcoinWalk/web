import { describe, expect, it } from "vitest";
import { cityTimeZone } from "./city-time";
import { scheduleOccurrences, DEFAULT_WEEKDAY } from "./walk-schedule";

describe("automatic city local time", () => {
  it("resolves Memphis from coordinates, not its name or the organizer's device", () => {
    expect(cityTimeZone({ latitude: 35.1495, longitude: -90.049 })).toBe("America/Chicago");
  });
  it("resolves other BitcoinWalk cities", () => {
    expect(cityTimeZone({ latitude: 32.65, longitude: -16.91 })).toBe("Atlantic/Madeira");
    expect(cityTimeZone({ latitude: 51.4027, longitude: 21.1471 })).toBe("Europe/Warsaw");
    expect(cityTimeZone({ latitude: 30.2672, longitude: -97.7431 })).toBe("America/Chicago");
  });
  it("preserves Memphis 10am across daylight-saving changes without a timezone field", () => {
    const walks = scheduleOccurrences({ seriesId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", firstDate: "2026-10-31", localTime: "10:00", timeZone: cityTimeZone({ latitude: 35.1495, longitude: -90.049 }), frequency: "weekly", weekday: DEFAULT_WEEKDAY, count: 2, durationMinutes: 60 }, Date.parse("2026-10-01"));
    expect(walks.map(w => new Date(w.start * 1000).toISOString())).toEqual(["2026-10-31T15:00:00.000Z", "2026-11-07T16:00:00.000Z"]);
  });
  it("rejects invalid coordinates instead of falling back to the device timezone", () => {
    for (const point of [{ latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: 0, longitude: Infinity }]) expect(() => cityTimeZone(point)).toThrow("map location");
  });
});
