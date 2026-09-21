import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, getPublicKey, type EventTemplate } from "nostr-tools";
import { signForOrganizer, validOrganizerKey } from "./organizer-identity";

const secret = new Uint8Array(32).fill(7);
const pubkey = getPublicKey(secret);
const template: EventTemplate = { kind: 30078, created_at: 100, tags: [["d", "test"]], content: "proposal" };
afterEach(() => vi.unstubAllGlobals());
describe("explicit organizer identity", () => {
  it("rejects npubs, private-key strings and malformed signer keys", () => {
    for (const value of ["", "npub1example", "nsec1example", "z".repeat(64)]) expect(() => validOrganizerKey(value)).toThrow();
    expect(validOrganizerKey(pubkey)).toBe(pubkey);
  });
  it("signs the exact proposal with the connected identity", async () => {
    vi.stubGlobal("window", { nostr: { getPublicKey: async () => pubkey, signEvent: async (t: EventTemplate) => finalizeEvent(t, secret) } });
    expect((await signForOrganizer(template, pubkey)).pubkey).toBe(pubkey);
  });
  it("stops before signing when the account changed", async () => {
    const signEvent = vi.fn();
    vi.stubGlobal("window", { nostr: { getPublicKey: async () => "f".repeat(64), signEvent } });
    await expect(signForOrganizer(template, pubkey)).rejects.toThrow("account changed");
    expect(signEvent).not.toHaveBeenCalled();
  });
  it("rejects changes made by the signer, even with a valid signature", async () => {
    vi.stubGlobal("window", { nostr: { getPublicKey: async () => pubkey, signEvent: async (t: EventTemplate) => {
      t.tags.push(["unexpected", "tag"]);
      return finalizeEvent(t, secret);
    } } });
    await expect(signForOrganizer(template, pubkey)).rejects.toThrow("changed event");
    expect(template.tags).toEqual([["d", "test"]]);
  });
  it("rejects a different signing key", async () => {
    vi.stubGlobal("window", { nostr: { getPublicKey: async () => pubkey, signEvent: async (t: EventTemplate) => finalizeEvent(t, new Uint8Array(32).fill(8)) } });
    await expect(signForOrganizer(template, pubkey)).rejects.toThrow("different identity");
  });
  it("rejects switching accounts during signing", async () => {
    vi.stubGlobal("window", { nostr: { getPublicKey: vi.fn().mockResolvedValueOnce(pubkey).mockResolvedValueOnce("f".repeat(64)), signEvent: async (t: EventTemplate) => finalizeEvent(t, secret) } });
    await expect(signForOrganizer(template, pubkey)).rejects.toThrow("during signing");
  });
});
