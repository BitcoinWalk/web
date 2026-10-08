import {finalizeEvent, type Event} from "nostr-tools";
import {describe, expect, it, vi} from "vitest";

vi.mock("../nostr/authority", async () => {
  const {getPublicKey} = await import("nostr-tools");
  return {SUPER_ADMIN_PUBKEY: getPublicKey(new Uint8Array(32).fill(1))};
});
import {resolvePublicCityHost} from "./public-city-host";

const cityId = "00000000-0000-4000-8000-000000000001", personal = "2".repeat(64), brand = "3".repeat(64);
function binding(action = "activate", previous?: Event, pubkey = brand, id = cityId) {
  const sequence = previous ? JSON.parse(previous.content).sequence + 1 : 0;
  return finalizeEvent({kind: 30312, created_at: 100 + sequence,
    tags: [["d", `${id}:${sequence}`], ["i", id], ["t", "bitcoinwalk-city-brand-v1"]],
    content: JSON.stringify({version: 1, cityId: id, sequence, previous: previous?.id ?? "", action, brandPubkey: pubkey}),
  }, new Uint8Array(32).fill(1));
}
function resolve(rows: Event[], second = rows) {
  return resolvePublicCityHost(cityId, "London", personal, {
    relays: () => ["one", "two"], read: async relay => relay === "one" ? rows : second,
  });
}
describe("public city host authority", () => {
  it("uses the signed creator grant for an unbranded city with no upcoming walk", async () => {
    expect(await resolvePublicCityHost(cityId, "London", undefined, {relays: () => ["one"], read: async () => [], creator: async () => personal})).toEqual({state: "personal", pubkey: personal});
  });
  it("does not even look up a personal creator for a branded city", async () => {
    const creator = vi.fn(async () => personal);
    expect(await resolvePublicCityHost(cityId, "London", undefined, {relays: () => ["one"], read: async () => [binding()], creator})).toMatchObject({state: "brand"});
    expect(creator).not.toHaveBeenCalled();
  });
  it("keeps the original host only when every authoritative read confirms no brand", async () => {
    expect(await resolve([])).toEqual({state: "personal", pubkey: personal});
  });
  it("uses the city identity for historical and future events without returning the personal key", async () => {
    expect(await resolve([binding()])).toEqual({state: "brand", pubkey: brand, name: "BitcoinWalk in London"});
  });
  it("resolves replacements from complete retained history", async () => {
    const first = binding(), second = binding("replace", first, "4".repeat(64));
    expect(await resolve([second, first, first])).toMatchObject({state: "brand", pubkey: "4".repeat(64)});
  });
  it("does not expose the personal identity after revocation", async () => {
    const first = binding();
    expect(await resolve([first, binding("revoke", first)])).toEqual({state: "unavailable"});
  });
  it("fails closed on disagreement, including empty/stale replicas", async () => {
    const first = binding();
    expect(await resolve([first], [])).toEqual({state: "unavailable"});
    expect(await resolve([first], [first, binding("revoke", first)])).toEqual({state: "unavailable"});
  });
  it("rejects altered signatures, foreign cities, missing predecessors and branches", async () => {
    const first = binding();
    for (const rows of [[{...first, content: first.content + " "}], [binding("activate", undefined, brand, "00000000-0000-4000-8000-000000000002")],
      [binding("replace", first, "4".repeat(64))], [first, binding("replace", first, "4".repeat(64)), binding("replace", first, "5".repeat(64))]]) {
      expect(await resolve(rows)).toEqual({state: "unavailable"});
    }
  });
  it("does not trust an ordinary user's self-signed binding", async () => {
    const first = binding();
    expect(await resolve([finalizeEvent(first, new Uint8Array(32).fill(2))])).toEqual({state: "unavailable"});
  });
  it("fails closed on read failure, caps and absent configuration", async () => {
    expect(await resolve(Array(500).fill(binding()))).toEqual({state: "unavailable"});
    expect(await resolvePublicCityHost(cityId, "London", personal, {relays: () => ["one"], read: async () => {throw new Error("offline");}})).toEqual({state: "unavailable"});
    expect(await resolvePublicCityHost(cityId, "London", personal, {relays: () => [], read: async () => []})).toEqual({state: "unavailable"});
  });
});
