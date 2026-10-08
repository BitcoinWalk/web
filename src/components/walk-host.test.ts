import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import WalkHost,{hostZapHref} from "./walk-host";
import {nip19} from "nostr-tools";

const pubkey="1".repeat(64);
describe("published walk host panel",()=>{
 it("shows only the dedicated profile and gates self-declared branded payment destinations",()=>{
  const html=renderToStaticMarkup(createElement(WalkHost,{pubkey,profile:{name:"BitcoinWalk in London",picture:"https://example.org/city.png",nip05:"london@bitcoinwalk.org",lnurl:"private@example.org"},branded:true,resolveProfile:false}));
  expect(html).toContain("BitcoinWalk in London");expect(html).toContain("https://example.org/city.png");expect(html).toContain("london@bitcoinwalk.org");
  expect(html).toContain(`nostr:${nip19.npubEncode(pubkey)}`);expect(html).toContain('aria-label="Copy npub"');
  expect(html).not.toContain("private@example.org");expect(html).not.toContain("lightning:");expect(html).toContain("City Lightning payments are not enabled yet");
 });
 it("keeps the city fallback name and npub without a resolved profile",()=>{
  const html=renderToStaticMarkup(createElement(WalkHost,{pubkey,profile:{name:"BitcoinWalk in London"},branded:true,resolveProfile:false}));
  expect(html).toContain("BitcoinWalk in London");expect(html).toContain(nip19.npubEncode(pubkey));expect(html).not.toContain("Unnamed Nostr user");
 });
 it("shows the signed event author and a wallet-safe thank-you zap link",()=>{const profile={name:"Alice",lnurl:"alice@example.org"};expect(hostZapHref(profile)).toBe("lightning:alice@example.org");const html=renderToStaticMarkup(createElement(WalkHost,{pubkey,profile,resolveProfile:false}));expect(html).toContain("Hosted by");expect(html).toContain("Alice");expect(html).toContain("Say thanks with a zap");expect(html).toContain('href="lightning:alice@example.org"');});
 it("does not invent a zap destination when the host has not published one",()=>{expect(hostZapHref({name:"Alice"})).toBeUndefined();const html=renderToStaticMarkup(createElement(WalkHost,{pubkey,profile:{name:"Alice"},resolveProfile:false}));expect(html).toContain("Zaps are not available for this host yet");expect(html).not.toContain("lightning:");});
 it("rejects unsafe or malformed wallet destinations",()=>{expect(hostZapHref({lnurl:"javascript:alert(1)"})).toBeUndefined();expect(hostZapHref({lnurl:"person @example.org"})).toBeUndefined();});
});
