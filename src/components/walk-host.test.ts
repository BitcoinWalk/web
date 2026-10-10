import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import WalkHost from "./walk-host";
import {nip19} from "nostr-tools";

const pubkey="1".repeat(64);
describe("published walk host panel",()=>{
 it("shows a verified Pro city action but not a self-declared payment destination",()=>{
  const html=renderToStaticMarkup(createElement(WalkHost,{pubkey,profile:{name:"BitcoinWalk in London",picture:"https://example.org/city.png",nip05:"london@bitcoinwalk.org",lnurl:"private@example.org"},payment:{kind:"zap",href:"lightning:london@bitcoinwalk.org"},resolveProfile:false}));
  expect(html).toContain("BitcoinWalk in London");expect(html).toContain("https://example.org/city.png");expect(html).toContain("london@bitcoinwalk.org");
  expect(html).toContain(`nostr:${nip19.npubEncode(pubkey)}`);expect(html).toContain('aria-label="Copy npub"');
  expect(html).not.toContain("private@example.org");expect(html).toContain('href="lightning:london@bitcoinwalk.org"');expect(html).toContain("Zap the host");
 });
 it("uses the same host-card space for the Basic HQ donation",()=>{
  const html=renderToStaticMarkup(createElement(WalkHost,{pubkey,profile:{name:"Alice",lnurl:"alice@example.org"},payment:{kind:"donate",href:"lightning:donate@bitcoinwalk.org"},resolveProfile:false}));
  expect(html).toContain("Alice");expect(html).toContain("Donate to BitcoinWalk HQ");expect(html).toContain('href="lightning:donate@bitcoinwalk.org"');
  expect(html).not.toContain("Say thanks with a zap");expect(html).not.toContain("alice@example.org");expect(html).not.toContain("Zap the host");
 });
 it("fails closed when managed Pro Lightning activation is unavailable",()=>{const html=renderToStaticMarkup(createElement(WalkHost,{pubkey,profile:{name:"BitcoinWalk in London",lnurl:"private@example.org"},payment:{kind:"unavailable"},resolveProfile:false}));expect(html).toContain("City Lightning payments are not enabled yet");expect(html).not.toContain("lightning:");expect(html).not.toContain("private@example.org");});
});
