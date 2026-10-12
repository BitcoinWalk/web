import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect} from "vitest";
import type {Event} from "nostr-tools";
import SponsorWorkspace from "./workspace";

describe("sponsor workspace",()=>{
 it("lists city sponsorships with collapsed walks and keeps invitations accessible",()=>{
  const event={id:"a".repeat(64),created_at:1} as Event;
  const html=renderToStaticMarkup(createElement(SponsorWorkspace,{cities:[{id:"city",name:"Madeira",slug:"madeira"}],walks:[{event,cityId:"city",address:"walk",label:"Madeira · 17 October"}],rows:[{event,sponsorship:{version:1,scope:{type:"city",cityId:"city"},mode:"sponsor",sponsorPubkey:"b".repeat(64)}}],busy:false,message:"",refresh:()=>{},onSelect:()=>{},editor:createElement("p",null,"Private display controls")}));
  expect(html).toContain("Cities (1)");expect(html).toContain("Sponsors (1)");expect(html).toContain("Madeira · 17 October");expect(html).toContain('aria-expanded="false"');expect(html).not.toContain("Private display controls");expect(html).not.toContain("Precedence");expect(html).toContain("Invite a sponsor");expect(html).toContain("https://bitcoinwalk.org/sponsor");expect(html).not.toContain("Sponsored walks and recovery files");
 });
});
