import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {nip19} from "nostr-tools";
import {describe,expect,it,vi} from "vitest";
import OrganizerIdentity,{remoteSignerConnectionURI,validSignerInput} from "./organizer-identity";

describe("OrganizerIdentity",()=>{
  it("offers the browser extension and one unified private-key or remote-signer path",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerIdentity,{disabled:false,onIdentityChange:vi.fn()}));
    expect(html).toContain("Sign in with browser extension");
    expect(html).toContain('role="tab"');
    expect(html.indexOf(">Sign in</button>")).toBeLessThan(html.indexOf(">Sign up</button>"));
    expect(html).toContain("Private key or signer");
    expect(html).toContain("nsec1… or bunker://…");
    expect(html).toContain("We recommend using Sidecar for secure signing");
    expect(html).toContain("https://sidecar.top");
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

  it("pairs QR signers through the dedicated recovery relay with the required account read",()=>{
    vi.stubGlobal("crypto",{randomUUID:()=>"pairing-secret"});
    try{
      const uri=new URL(remoteSignerConnectionURI(new Uint8Array(32).fill(1),"https://app-staging.bitcoinwalk.org"));
      expect(uri.searchParams.getAll("relay")).toEqual(["wss://remote.bitcoinwalk.org/"]);
      expect(uri.searchParams.get("perms")?.split(",")).toContain("get_public_key");
      expect(uri.searchParams.get("secret")).toBe("pairing-secret");
    }finally{vi.unstubAllGlobals();}
  });

  it("supports dashboard-specific heading and introductory copy",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerIdentity,{disabled:false,onIdentityChange:vi.fn(),heading:"Your account",intro:"Open your dashboard."}));
    expect(html).toContain(">Your account</h2>");
    expect(html).toContain("Open your dashboard.");
    expect(html).not.toContain("Step 2 of 3");
  });

  it("can limit a screen to existing-account connection",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerIdentity,{allowAccountCreation:false,disabled:false,onIdentityChange:vi.fn(),heading:"Connect your BitcoinWalk Host",intro:"Connect an existing identity."}));
    expect(html).toContain("Connect your BitcoinWalk Host");
    expect(html).toContain("Sign in with browser extension");
    expect(html).toContain("Private key or signer");
    expect(html).toContain('>Help</button>');
    expect(html).not.toContain(">Sign up</button>");
    expect(html).not.toContain("Locally created accounts");
    expect(html).not.toContain("or connect");
  });
});
