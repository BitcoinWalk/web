import {renderToStaticMarkup} from "react-dom/server";
import {finalizeEvent, nip19} from "nostr-tools";
import {describe, expect, it, vi} from "vitest";
vi.mock("../server/public-city-host", () => ({resolvePublicCityHost: vi.fn()}));
vi.mock("../domain/walk-weather", () => ({getWalkWeather: vi.fn(async () => ({kind: "unavailable"}))}));
vi.mock("./walk-delegation", () => ({default: () => "Personal delegation presentation"}));
import {resolvePublicCityHost} from "../server/public-city-host";
import WalkEvent from "./walk-event";
import {createInitialCalendarProposal} from "../nostr/calendar-event";
import {calendarNevent, type CalendarWalk} from "../nostr/calendar-records";
import {relayConfig} from "../lib/relay-config";

const city = {cityId: "00000000-0000-4000-8000-000000000001", slug: "london", cityName: "London", description: "London walk", startAt: "2026-10-10T10:00:00Z", meetingPoint: {description: "Square", latitude: 51.5, longitude: -0.12}};
const event = finalizeEvent(createInitialCalendarProposal(city, "Europe/London"), new Uint8Array(32).fill(2));
const walk: CalendarWalk = {revision: {event, city}, approval: {event, approval: {cityId: city.cityId, cityRevisionId: event.id, status: "approved"}}};

describe("walk route branded-host integration", () => {
  it("replaces the historic personal presentation without changing the signed event or nevent", async () => {
    const before = JSON.stringify(event), brand = "3".repeat(64);
    vi.mocked(resolvePublicCityHost).mockResolvedValue({state: "brand", pubkey: brand, name: "BitcoinWalk in London"});
    const html = renderToStaticMarkup(await WalkEvent({event, walk, currentProfile: walk}));
    expect(resolvePublicCityHost).toHaveBeenCalledWith(city.cityId, "London", event.pubkey);
    expect(html).toContain(nip19.npubEncode(brand));
    expect(html).not.toContain(nip19.npubEncode(event.pubkey));
    expect(html).not.toContain("Personal delegation presentation");
    expect(html).toContain(calendarNevent(event, relayConfig.calendarRelayHints));
    expect(JSON.stringify(event)).toBe(before);
  });
  it("does not expose adjacent personal hosting when binding verification fails", async () => {
    vi.mocked(resolvePublicCityHost).mockResolvedValue({state: "unavailable"});
    const html = renderToStaticMarkup(await WalkEvent({event, walk, currentProfile: walk}));
    expect(html).toContain("City host identity is temporarily unavailable");
    expect(html).not.toContain("Personal delegation presentation");
    expect(html).not.toContain(nip19.npubEncode(event.pubkey));
  });
  it("preserves ordinary host and delegation presentation for unbranded cities", async () => {
    vi.mocked(resolvePublicCityHost).mockResolvedValue({state: "personal", pubkey: event.pubkey});
    const html = renderToStaticMarkup(await WalkEvent({event, walk, currentProfile: walk}));
    expect(html).toContain(nip19.npubEncode(event.pubkey));
    expect(html).toContain("Personal delegation presentation");
  });
});
