import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import OrganizerIdentity from "./organizer-identity";

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
    expect(html).not.toContain("Connect remote signer");
    expect(html).not.toContain("Use key for this page");
    expect(html).not.toContain("Use a private key or remote signer");
  });
});
