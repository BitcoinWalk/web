import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import Page from "./page";

describe("owner relay directory page",()=>{
  it("explains browser-only signing and separates ownership from recognition",()=>{
    const html=renderToStaticMarkup(createElement(Page));
    expect(html).toContain("Relay directory");
    expect(html).toContain("NIP-07-compatible browser signer");
    expect(html).toContain("never receives the private key");
    expect(html).toContain("not BitcoinWalk recognition or payment entitlement");
  });
});
