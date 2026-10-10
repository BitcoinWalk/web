import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import CitySignerSetup, {citySignerConnectionError} from "./city-signer-setup";

describe("CitySignerSetup", () => {
  it("keeps the city signer separate and requires explicit recovery acknowledgement", () => {
    const html = renderToStaticMarkup(createElement(CitySignerSetup, {cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityName: "London", actor: "a".repeat(64), saved: {configured: false}, setupReady:false,busy: false, onSaved: vi.fn(),onActivation:vi.fn()}));
    expect(html).toContain("Separate city signer");
    expect(html).toContain("never replaces your personal dashboard login");
    expect(html).toContain("Create new city identity");
    expect(html).toContain("nsec1… or bunker://…");
    expect(html).toContain("never uploads or stores the private key");
  });
  it("shows only the truncated expected public identity and a deliberate clear action", () => {
    const html = renderToStaticMarkup(createElement(CitySignerSetup, {cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityName: "London", actor: "a".repeat(64), saved: {configured: true, pubkey: "b".repeat(64), version: 2}, setupReady:true,busy: false, onSaved: vi.fn(),onActivation:vi.fn()}));
    expect(html).toContain("Expected city identity"); expect(html).toContain("version 2"); expect(html).toContain("Clear saved city signer");
    expect(html).toContain("Reconnect the expected city identity"); expect(html).not.toContain("Create new city identity");
    expect(html).not.toContain("b".repeat(64));
  });
  it("rejects a personal or wrong saved identity before signing", () => {
    expect(citySignerConnectionError("a".repeat(64), "a".repeat(64), {configured:false})).toContain("personal dashboard");
    expect(citySignerConnectionError("c".repeat(64), "a".repeat(64), {configured:true,pubkey:"b".repeat(64),version:1})).toContain("does not match");
    expect(citySignerConnectionError("b".repeat(64), "a".repeat(64), {configured:true,pubkey:"b".repeat(64),version:1})).toBeNull();
  });
  it("turns a stale request into a safe resumable state", () => {
    const html = renderToStaticMarkup(createElement(CitySignerSetup, {cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityName: "London", actor: "a".repeat(64), saved: {configured: true, pubkey: "b".repeat(64), version: 2}, activation:{requestId:"request",expiresAt:1,proofsReady:true},setupReady:true,busy: false, onSaved: vi.fn(),onActivation:vi.fn()}));
    expect(html).toContain("Activation request expired"); expect(html).toContain("saved payout and city signer are unchanged"); expect(html).toContain("Dismiss expired request");
  });
});
