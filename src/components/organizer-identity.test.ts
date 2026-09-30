import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {nip19} from "nostr-tools";
import {describe,expect,it,vi} from "vitest";
import OrganizerIdentity,{validSignerInput} from "./organizer-identity";

describe("OrganizerIdentity",()=>{
  it("offers the browser extension and one unified private-key or remote-signer path",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerIdentity,{disabled:false,onIdentityChange:vi.fn()}));
    expect(html).toContain("Connect with browser extension");
    expect(html).toContain("Private key or signer");
    expect(html).toContain("nsec1… or bunker://…");
    expect(html).toContain("Recommended on desktop");
    expect(html).toContain("https://getalby.com/alby-extension");
    expect(html).toContain("https://github.com/greenart7c3/Amber");
    expect(html).toContain("Amber (Android)");
    expect(html).toContain("https://testflight.apple.com/join/5Mx5AZx7");
    expect(html).toContain("Clave (iOS via TestFlight)");
    expect(html).toContain("More connection options");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Connect<\/button>/);
    expect(html).not.toContain("Connect remote signer");
    expect(html).not.toContain("Use key for this page");
    expect(html).not.toContain("Use a private key or remote signer");
  });

  it("enables connection only for a complete nsec or bunker value",()=>{
    expect(validSignerInput("not a signer")).toBe(false);
    expect(validSignerInput("bunker://"+"a".repeat(64))).toBe(false);
    expect(validSignerInput("bunker://"+"a".repeat(64)+"?relay=wss%3A%2F%2Frelay.example.com%2F&secret=test")).toBe(true);
    expect(validSignerInput(nip19.nsecEncode(new Uint8Array(32).fill(1)))).toBe(true);
  });

  it("supports dashboard-specific heading and introductory copy",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerIdentity,{disabled:false,onIdentityChange:vi.fn(),heading:"Your account",intro:"Open your dashboard."}));
    expect(html).toContain(">Your account</h2>");
    expect(html).toContain("Open your dashboard.");
    expect(html).not.toContain("Step 2 of 3");
  });
});
