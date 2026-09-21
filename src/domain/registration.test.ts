import { describe, expect, it } from "vitest";
import { cityDocumentSchema } from "./city";
import { approvedDirectory } from "./directory";
import { registrationDocument, PAID_PRICE_SATS, PLAN_BENEFITS } from "./registration";
import { createCityUpdateEvent } from "../nostr/city-event";
import type { CityRevision, ApprovalRecord } from "../nostr/city-records";

const input = { cityId: "6302b5c2-b579-4441-a828-9bffce073f97", cityName: "Funchal", startAt: "2026-10-03T10:00:00Z", description: "Walk with us", location: { latitude: 32.6, longitude: -16.9, description: "Square" }, meetingDescription: "", heroImageUrl: "https://example.com/hero.jpg", requestedTier: "free" as const };
describe("two-step registration", () => {
  it("validates details before account connection and preserves selected values", () => {
    expect(registrationDocument(input)).toMatchObject({ cityId: input.cityId, cityName: "Funchal", slug: "funchal", startAt: new Date(input.startAt).toISOString(), requestedTier: "free", meetingPoint: input.location });
    expect(registrationDocument({ ...input, meetingDescription: "Cafe" }).meetingPoint.description).toBe("Cafe");
  });
  it("blocks missing pin, invalid dates, blank descriptions and invalid images", () => {
    for (const change of [{ location: null }, { startAt: "bad" }, { description: " " }, { heroImageUrl: "bad" }, { cityName: "" }]) expect(() => registrationDocument({ ...input, ...change })).toThrow();
  });
  it("includes the Paid preference in signed event content, without payment claims", () => {
    const city = registrationDocument({ ...input, requestedTier: "paid" });
    const content = JSON.parse(createCityUpdateEvent(city).content);
    expect(cityDocumentSchema.parse(content).requestedTier).toBe("paid");
    expect(content).not.toHaveProperty("paymentStatus");
    expect(content).not.toHaveProperty("hasPaidRelay");
  });
  it("keeps historical documents compatible and rejects arbitrary preferences", () => {
    const old = registrationDocument(input);
    delete old.requestedTier;
    expect(cityDocumentSchema.parse(old).requestedTier).toBeUndefined();
    expect(cityDocumentSchema.safeParse({ ...old, requestedTier: "paid-activated" }).success).toBe(false);
  });
  it("does not grant paid entitlement or routing from a requested plan", () => {
    const city = registrationDocument({ ...input, requestedTier: "paid" });
    const revision = { city, event: { id: "revision", created_at: 1 } } as CityRevision;
    const approval = { approval: { cityId: city.cityId, cityRevisionId: "revision", status: "approved" }, event: { id: "approval", created_at: 2 } } as ApprovalRecord;
    expect(approvedDirectory([revision], [approval], {})[0]).toMatchObject({ tier: "free", href: "/funchal" });
  });
  it("prices lifetime access at 21k and keeps NIP-05/LNURL paid only", () => {
    expect(PAID_PRICE_SATS).toBe(21000);
    for (const row of PLAN_BENEFITS.filter(row => /NIP-05|LNURL/.test(row.benefit))) expect(row.free).toBe("Not included");
    expect(PLAN_BENEFITS.find(row => row.benefit.includes("node"))?.paid).toContain("Planned");
    expect(PLAN_BENEFITS.find(row => row.benefit.includes("marketplace"))?.paid).toContain("Future");
  });
});
