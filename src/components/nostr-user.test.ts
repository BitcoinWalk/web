import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import NostrUser from "./nostr-user";

describe("Nostr user identity",()=>{
 it("renders the connected user's avatar and name in compact mode",()=>{
  const html=renderToStaticMarkup(createElement(NostrUser,{pubkey:"3".repeat(64),profile:{name:"Sponsor Alice",picture:"https://example.org/avatar.webp"},variant:"compact",showLightning:false,resolveProfile:false}));
  expect(html).toContain("Sponsor Alice");
  expect(html).toContain('src="https://example.org/avatar.webp"');
  expect(html).toContain('aria-label="Copy npub"');
  expect(html).not.toContain("Account connected");
  expect(html).not.toContain("<dt>LNURL</dt>");
 });
 it("keeps an identifiable fallback for accounts without public metadata",()=>{
  const html=renderToStaticMarkup(createElement(NostrUser,{pubkey:"4".repeat(64),variant:"compact",resolveProfile:false}));
  expect(html).toContain("Unnamed Nostr user");
  expect(html).toContain("npub1");
  expect(html).not.toContain("<img");
 });
 it("leads with the display name and keeps NIP-05 on the same identity line",()=>{
  const html=renderToStaticMarkup(createElement(NostrUser,{pubkey:"1".repeat(64),profile:{name:"BitcoinWalk",nip05:"bitcoinwalk.org",lnurl:"walk@example.org"},resolveProfile:false}));
  expect(html).toContain("BitcoinWalk");
  expect(html).toContain("bitcoinwalk.org");
  expect(html).toContain("checking…");
  expect(html).not.toContain("<dt>Username</dt>");
  expect(html).not.toContain("<dt>NIP-05</dt>");
 });
 it("gives every available value an accessible live copy control",()=>{
  const html=renderToStaticMarkup(createElement(NostrUser,{pubkey:"2".repeat(64),profile:{name:"Alice",nip05:"alice@example.org",lnurl:"alice@example.org"},resolveProfile:false}));
  for(const label of ["username","NIP-05","npub","LNURL"])expect(html).toContain(`aria-label="Copy ${label}"`);
  expect(html.match(/aria-live="polite"/g)).toHaveLength(4);
 });
});
