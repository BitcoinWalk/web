import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadCalendarWalks: vi.fn() }));
vi.mock("../nostr/calendar-records", () => ({ loadCalendarWalks: mocks.loadCalendarWalks }));
vi.mock("../lib/server-relay-config", () => ({ serverReadRelays: () => ["wss://relay.example"] }));
vi.mock("./chat-config", () => ({ serverChatConfig: () => ({
  environment: "production",
  global: { relay: "wss://chat.bitcoinwalk.org", groupId: "13bc3a423b4f2954" },
  paidCities: {},
}) }));
vi.mock("./share-preview", () => ({ shareOrigin: () => "https://bitcoinwalk.org" }));

import { loadPublicCityDirectory } from "./public-city-directory";

function row(cityId: string, cityName: string, slug: string, aliases: string[] = []) {
  return { revision: { city: { cityId, cityName, slug, aliases } } };
}

describe("public city directory", () => {
  beforeEach(() => mocks.loadCalendarWalks.mockReset());

  it("sorts and deduplicates approved cities with canonical links", async () => {
    mocks.loadCalendarWalks.mockResolvedValue([
      row("b", "Zürich", "zurich", ["Zuerich", "Zuerich"]),
      row("a", "Madeira", "madeira"),
      row("a", "Madeira", "madeira"),
    ]);
    const directory = await loadPublicCityDirectory(Date.parse("2026-10-13T12:00:00.000Z"));
    expect(directory).toMatchObject({ version: 1, generatedAt: "2026-10-13T12:00:00.000Z" });
    expect(directory.cities.map((city) => city.name)).toEqual(["Madeira", "Zürich"]);
    expect(directory.cities[0]).toMatchObject({
      id: "a",
      slug: "madeira",
      canonicalUrl: "https://bitcoinwalk.org/madeira",
      chat: { scope: "global", url: "https://bitcoinwalk.org/join" },
    });
    expect(directory.cities[1].aliases).toEqual(["Zuerich"]);
  });

  it("does not fall a paid city back to the global room before dedicated chat is verified", async () => {
    mocks.loadCalendarWalks.mockResolvedValue([
      row("8e136ccb-923b-41aa-a6d1-1290b0b3a014", "Würzburg", "wuerzburg", ["Wurzburg"]),
    ]);
    expect((await loadPublicCityDirectory(0)).cities[0].chat).toEqual({ scope: "city", url: null });
  });
});
