import {describe, expect, it} from "vitest";
import {finalizeEvent, getPublicKey, verifyEvent} from "nostr-tools";
import {authorizeCitySignerProof, authorizeProSetup, citySignerProofTemplate, proSetupTemplate} from "./pro-setup-command";
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
  it("binds the exact payout destination into the owner's signature", () => {
    const save = {action: "save-payout" as const, cityId: command.cityId, destination: "alice@wallet.example"};
    const event = finalizeEvent(proSetupTemplate(save, origin, now), key);
    expect(authorizeProSetup(event, origin, now)).toEqual(save);
    event.content = JSON.stringify({...save, destination: "attacker@wallet.example"});
    expect(() => authorizeProSetup(event, origin, now)).toThrow();
  });
  it("requires a separate proof from the exact city signer", () => {
    const brandKey = new Uint8Array(32).fill(3), brandPubkey = getPublicKey(brandKey);
    const save = {action: "confirm-city-signer" as const, cityId: command.cityId, brandPubkey, backupAcknowledged: true as const};
    expect(authorizeProSetup(finalizeEvent(proSetupTemplate(save, origin, now), key), origin, now)).toEqual(save);
    const proof = finalizeEvent(citySignerProofTemplate(save, origin, now), brandKey);
    expect(authorizeCitySignerProof(proof, save, origin, now).pubkey).toBe(brandPubkey);
    expect(() => authorizeCitySignerProof(finalizeEvent(citySignerProofTemplate(save, origin, now), key), save, origin, now)).toThrow("expected identity");
    expect(() => authorizeCitySignerProof(proof, {...save, brandPubkey: getPublicKey(key)}, origin, now)).toThrow();
    expect(() => proSetupTemplate({...save, backupAcknowledged: false} as never, origin, now)).toThrow();
  });
});
