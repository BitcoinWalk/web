import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import Page from "./page";

describe("owner relay directory page",()=>{
  it("explains owner signing and separates signing from recognition",()=>{
    const html=renderToStaticMarkup(createElement(Page));
    expect(html).toContain("City relay setup");
    expect(html).toContain("connected Nostr signer");
    expect(html).toContain("never receives the private key");
    expect(html).toContain("does not itself establish BitcoinWalk recognition or payment entitlement");
    expect(html).toContain("does not publish or activate the relay");
    expect(html).toContain("Successor rehearsals");
    expect(html).toContain("No active successor rehearsals");
  });
});
