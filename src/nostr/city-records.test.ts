import { describe, expect, it } from "vitest";
import { resolveApprovedCity, type CityRevision } from "./city-records";

const revision = (id: string, createdAt: number, slug = "austin"): CityRevision =>
  ({
    event: { id, sig: "a".repeat(128), pubkey: "b".repeat(64), created_at: createdAt, kind: 30303, tags: [], content: "" },
    city: {
      cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f",
      slug,
      cityName: "Austin",
      startAt: "2026-09-19T15:00:00.000Z",
      description: "A weekly walk.",
      meetingPoint: { description: "City Hall", latitude: 30.2672, longitude: -97.7431 },
      chatUrl: "https://example.com/chat",
      heroImageUrl: "https://example.com/hero.jpg",
    },
  }) as CityRevision;

describe("approved city resolver", () => {
  it("excludes unsigned approval states and resolves only the approved revision", () => {
    const visible = resolveApprovedCity(
      [revision("1".repeat(64), 2), revision("2".repeat(64), 1)],
      [
        {
          event: {} as never,
          approval: { cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityRevisionId: "2".repeat(64), status: "approved" },
        },
      ],
      "austin",
    );
    expect(visible?.event.id).toBe("2".repeat(64));
  });
});
