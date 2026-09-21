import { describe, expect, it } from "vitest";
import { createCalendarEvent } from "./calendar-event";

const city = {
  cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f",
  slug: "austin",
  cityName: "Austin",
  startAt: "2026-09-19T15:00:00.000Z",
  description: "A weekly walk.",
  meetingPoint: { description: "City Hall", latitude: 30.2672, longitude: -97.7431 },
  chatUrl: "https://example.com/chat",
  heroImageUrl: "https://example.com/hero.jpg",
};

describe("NIP-52 calendar event", () => {
  it("includes schedule, location, image, and chat fields", () => {
    const event = createCalendarEvent(city, { id: "austin-20260919", startUnixSeconds: 1_789_715_200 });
    expect(event.kind).toBe(31923);
    expect(event.tags).toContainEqual(["image", "https://example.com/hero.jpg"]);
    expect(event.tags).toContainEqual(["r", "https://example.com/chat"]);
  });
});
