import { describe, expect, it } from "vitest";
import { createApprovalEvent, createCityUpdateEvent } from "./city-event";

describe("city update event", () => {
  it("uses a stable city identifier and a version link", () => {
    const event = createCityUpdateEvent(
      {
        cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f",
        slug: "austin",
        cityName: "Austin",
        startAt: "2026-09-19T15:00:00.000Z",
        description: "A weekly walk.",
        meetingPoint: { description: "City Hall", latitude: 30.2672, longitude: -97.7431 },
        chatUrl: "https://example.com/chat",
        heroImageUrl: "https://example.com/hero.jpg",
      },
      "previous-event-id",
    );

    expect(event.tags.find(t => t[0] === "d")?.[1]).toMatch(/^66f137cb-2ac1-4eef-8358-7dd66b45922f:[0-9a-f-]{36}$/);
    expect(event.tags).toContainEqual(["i", "66f137cb-2ac1-4eef-8358-7dd66b45922f"]);
    expect(event.tags).toContainEqual(["e", "previous-event-id", "", "previous"]);
  });
});

describe("approval event", () => {
  it("references the city revision and decision", () => {
    const event = createApprovalEvent({
      cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f",
      cityRevisionId: "1".repeat(64),
      initialEventId: "2".repeat(64), heroImageUrl:"https://example.com/approved.jpg", status: "approved",
    });
    expect(event.kind).toBe(30304);
    expect(event.tags).toContainEqual(["e", "1".repeat(64), "", "city-revision"]);
    expect(event.tags).toContainEqual(["e", "2".repeat(64), "", "initial-walk"]);
    expect(JSON.parse(event.content).heroImageUrl).toBe("https://example.com/approved.jpg");
  });
});
