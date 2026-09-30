import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import WalkIdentifiers from "./walk-identifiers";

describe("walk identifiers",()=>{
 it("shows copy controls for the organizer npub and URL nevent",()=>{
  const html=renderToStaticMarkup(createElement(WalkIdentifiers,{organizerNpub:"npub1organizer",nevent:"nevent1publicevent"}));
  expect(html).toContain("npub1organizer");
  expect(html).toContain('aria-label="Copy organizer npub"');
  expect(html).toContain("nevent1publicevent");
  expect(html).toContain('aria-label="Copy nevent"');
  expect(html).not.toContain("Event ID");
 });
});
