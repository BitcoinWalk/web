import { describe, expect, it } from "vitest";
import { armadaChatUrl, resolveCityChat, type ChatConfig } from "./chat";

const config: ChatConfig = {
  environment: "staging",
  global: { relay: "wss://chat-staging.bitcoinwalk.org", groupId: "global-test" },
  paidCities: {
    paid: { slug: "austin", destination: { relay: "wss://austin.bitcoinwalk.org", groupId: "city-test" } },
    pending: { slug: "radom", destination: null },
  },
};

describe("operator-controlled chat routing", () => {
  it("routes free and legacy cities to the global channel", () => {
    expect(resolveCityChat("free", "radom", config).url).toBe("https://armada.buzz/s/chat-staging.bitcoinwalk.org/global-test");
    expect(resolveCityChat(undefined, "austin", config).scope).toBe("global");
  });
  it("routes a provisioned paid city to its dedicated relay and group", () => {
    expect(resolveCityChat("paid", "austin", config)).toEqual({ scope: "city", environment: "staging", url: "https://armada.buzz/s/austin.bitcoinwalk.org/city-test" });
  });
  it("does not fabricate a link or fall back to global for pending paid cities", () => {
    expect(resolveCityChat("pending", "radom", config)).toMatchObject({ scope: "city", url: null });
  });
  it("does not reuse a city's destination for a different slug", () => {
    expect(resolveCityChat("paid", "london", config).url).toBeNull();
  });
  it("handles missing global provisioning", () => {
    expect(resolveCityChat(undefined, "radom", { ...config, global: null }).url).toBeNull();
  });
  it("does not treat prototype properties as paid city records", () => {
    expect(resolveCityChat("constructor", "radom", config).scope).toBe("global");
  });
  it.each([
    "javascript:alert(1)", "ws://austin.bitcoinwalk.org", "wss://evil.example",
    "wss://austin.bitcoinwalk.org.evil.example", "wss://user@austin.bitcoinwalk.org",
    "wss://austin.bitcoinwalk.org/path", "wss://austin.bitcoinwalk.org?x=1",
    "wss://austin.bitcoinwalk.org#x", "wss://austin.bitcoinwalk.org:444",
  ])("rejects invalid destinations: %s", (relay) => {
    expect(armadaChatUrl({ relay, groupId: "chat" })).toBeNull();
  });
  it.each(["", "../chat", "chat?invite=x", "a/b", "#chat"])("rejects unsafe group IDs: %s", (groupId) => {
    expect(armadaChatUrl({ relay: "wss://austin.bitcoinwalk.org", groupId })).toBeNull();
  });
});
