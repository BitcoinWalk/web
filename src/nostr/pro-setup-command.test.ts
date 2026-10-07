import {describe, expect, it} from "vitest";
import {finalizeEvent, verifyEvent} from "nostr-tools";
import {authorizeProSetup, proSetupTemplate} from "./pro-setup-command";
const origin = "https://bitcoinwalk.org", now = 2_000_000_000;
const command = {action: "preview" as const, cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f"};
const key = new Uint8Array(32).fill(2);
describe("private Pro setup commands", () => {
  it("binds signed commands to the exact origin, endpoint, action and time", () => {
    const event = finalizeEvent(proSetupTemplate(command, origin, now), key);
    expect(authorizeProSetup(event, origin, now)).toEqual(command);
    expect(() => authorizeProSetup(event, "https://app-staging.bitcoinwalk.org", now)).toThrow();
    expect(() => authorizeProSetup(event, origin, now + 301)).toThrow();
    expect(() => authorizeProSetup(event, origin, now - 301)).toThrow();
    expect(() => proSetupTemplate(command, "http://bitcoinwalk.org")).toThrow();
  });
  it("rejects tampering even after the signature verifier cached success", () => {
    const event = finalizeEvent(proSetupTemplate(command, origin, now), key);
    expect(verifyEvent(event)).toBe(true);
    event.content = JSON.stringify({...command, cityId: "6302b5c2-b579-4441-a828-9bffce073f97"});
    expect(() => authorizeProSetup(event, origin, now)).toThrow();
  });
  it("does not accept browser-supplied entitlement, owner or payout claims", () => {
    const template = proSetupTemplate(command, origin, now);
    const event = finalizeEvent({...template, content: JSON.stringify({...command, owner: "a".repeat(64), paid: true})}, key);
    expect(() => authorizeProSetup(event, origin, now)).toThrow();
  });
});
