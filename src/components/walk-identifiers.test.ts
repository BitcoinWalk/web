import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import WalkIdentifiers,{compactNostrIdentifier} from "./walk-identifiers";

describe("walk identifiers",()=>{
 it("shows compact identifiers while keeping their copy controls",()=>{
  const organizerNpub="npub1abcdefghijklmnopqrstuvwxyz";
  const nevent="nevent1abcdefghijklmnopqrstuvwxyz";
  const html=renderToStaticMarkup(createElement(WalkIdentifiers,{organizerNpub,nevent}));
  expect(html).toContain("npub1abc...xyz");
  expect(html).not.toContain(organizerNpub);
  expect(html).toContain('aria-label="Copy organizer npub"');
  expect(html).toContain("nevent1abc...xyz");
  expect(html).not.toContain(nevent);
  expect(html).toContain('aria-label="Copy nevent"');
  expect(html).not.toContain("Event ID");
 });
 it("does not abbreviate short identifiers",()=>{
  expect(compactNostrIdentifier("npub1short")).toBe("npub1short");
 });
});
