import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import CitySignerSetup, {citySignerConnectionError} from "./city-signer-setup";

describe("CitySignerSetup", () => {
  it("offers a verified skip path while keeping explicit recovery acknowledgement", () => {
    const html = renderToStaticMarkup(createElement(CitySignerSetup, {cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityName: "London", actor: "a".repeat(64), saved: {configured: false}, setupReady:false,busy: false, onSaved: vi.fn(),onActivation:vi.fn()}));
    expect(html).toContain("City identity");
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("This BitcoinWalk was created with your current profile.");
    expect(html).toContain("Would you like to keep this profile as the identity that started BitcoinWalk in London?");
    expect(html).toContain("Keep this identity");
    expect(html).toContain("New identity");
    expect(html).not.toContain("Recommended");
    expect(html).not.toContain("recovery method");
    expect(html).not.toContain("Create new city identity");
    expect(html).not.toContain("nsec1… or bunker://…");
    expect(html.indexOf("Keep this identity")).toBeLessThan(html.indexOf("New identity"));
  });
  it("shows a concise reconnect step with only the truncated saved identity", () => {
    const html = renderToStaticMarkup(createElement(CitySignerSetup, {cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityName: "London", actor: "a".repeat(64), saved: {configured: true, pubkey: "b".repeat(64), version: 2}, setupReady:true,busy: false, onSaved: vi.fn(),onActivation:vi.fn()}));
    expect(html).toContain("Reconnect city identity"); expect(html).toContain("BitcoinWalk in London"); expect(html).toContain("Clear saved city signer");
    expect(html).toContain("Private key or bunker connection"); expect(html).not.toContain("Create new city identity");
    expect(html).not.toContain("Reuse the existing city identity"); expect(html).not.toContain("This city already has a saved, verified identity");
    expect(html).not.toContain("b".repeat(64));
  });
  it("offers one prominent connection action when the saved identity is the connected account", () => {
    const html = renderToStaticMarkup(createElement(CitySignerSetup, {cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityName: "Rye", actor: "a".repeat(64), saved: {configured: true, pubkey: "a".repeat(64), version: 1}, setupReady:true,busy: false, onSaved: vi.fn(),onActivation:vi.fn()}));
    expect(html).toContain("Connect saved identity");
    expect(html).toContain("Use a backup or remote signer instead");
    expect(html).not.toContain("✓");
  });
  it("renders a compact completed identity step when navigating back", () => {
    const html = renderToStaticMarkup(createElement(CitySignerSetup, {cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityName: "Rye", actor: "a".repeat(64), saved: {configured: true, pubkey: "a".repeat(64), version: 1}, stage:2,setupReady:false,busy: false, onSaved: vi.fn(),onActivation:vi.fn(),onContinue:vi.fn()}));
    expect(html).toContain("The city identity is saved.");
    expect(html).toContain("Return to payout");
    expect(html).not.toContain("Private key or bunker connection");
  });
  it("rejects a personal or wrong saved identity before signing", () => {
    expect(citySignerConnectionError("a".repeat(64), "a".repeat(64), {configured:false})).toContain("personal dashboard");
    expect(citySignerConnectionError("c".repeat(64), "a".repeat(64), {configured:true,pubkey:"b".repeat(64),version:1})).toContain("does not match");
    expect(citySignerConnectionError("b".repeat(64), "a".repeat(64), {configured:true,pubkey:"b".repeat(64),version:1})).toBeNull();
  });
  it("turns a stale request into a safe resumable state", () => {
    const html = renderToStaticMarkup(createElement(CitySignerSetup, {cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", cityName: "London", actor: "a".repeat(64), saved: {configured: true, pubkey: "b".repeat(64), version: 2}, activation:{requestId:"request",expiresAt:1,proofsReady:true,status:"pending"},setupReady:true,busy: false, onSaved: vi.fn(),onActivation:vi.fn()}));
    expect(html).toContain("Activation request expired"); expect(html).toContain("saved payout and city signer are unchanged"); expect(html).toContain("Dismiss expired request");
  });
});
