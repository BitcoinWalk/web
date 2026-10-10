import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {nip19} from "nostr-tools";
vi.mock("../server/public-city-host", () => ({resolvePublicCityHost: vi.fn()}));
import PublicCityHost, {CityHostPanel} from "./public-city-host";
import {resolvePublicCityHost} from "../server/public-city-host";

describe("shared public host presentation", () => {
  it("renders only the resolved city key in server output", () => {
    const key = "3".repeat(64);
    const html = renderToStaticMarkup(createElement(CityHostPanel, {host: {state: "brand", pubkey: key, name: "BitcoinWalk in London"},payment:{kind:"zap",href:"lightning:london@bitcoinwalk.org"}}));
    expect(html).toContain(nip19.npubEncode(key));
    expect(html).toContain("BitcoinWalk in London");
    expect(html).toContain('href="lightning:london@bitcoinwalk.org"');
    expect(html).toContain("Zap the host");
    expect(html).not.toContain(nip19.npubEncode("2".repeat(64)));
  });
  it("does not render a personal identity or payment when authority is unavailable", () => {
    const html = renderToStaticMarkup(createElement(CityHostPanel, {host: {state: "unavailable"},payment:{kind:"unavailable"}}));
    expect(html).toContain("temporarily unavailable");
    expect(html).not.toContain("npub1");
    expect(html).not.toContain("lightning:");
  });
  it("keeps the safe HQ donation available for a Basic city when host identity is unavailable", () => {
    const html = renderToStaticMarkup(createElement(CityHostPanel, {host: {state: "unavailable"},payment:{kind:"donate",href:"lightning:donate@bitcoinwalk.org"}}));
    expect(html).toContain("Donate to BitcoinWalk HQ");
    expect(html).toContain('href="lightning:donate@bitcoinwalk.org"');
    expect(html).not.toContain("Zap the host");
  });
  it("uses the same resolver for a city with no upcoming event", async () => {
    vi.mocked(resolvePublicCityHost).mockResolvedValue({state: "brand", pubkey: "3".repeat(64), name: "BitcoinWalk in London"});
    const panel = await PublicCityHost({cityId: "city", cityName: "London"});
    expect(resolvePublicCityHost).toHaveBeenCalledWith("city", "London", undefined);
    expect(renderToStaticMarkup(panel)).toContain("BitcoinWalk in London");
  });
});
