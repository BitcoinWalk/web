import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect} from "vitest";
import type {Event} from "nostr-tools";
import SponsorWorkspace,{nextWalkIdsByCity,walkMatchesStatus} from "./workspace";

describe("sponsor workspace",()=>{
 it("lists city sponsorships with collapsed walks and keeps invitations accessible",()=>{
  const event={id:"a".repeat(64),created_at:1} as Event;
  const html=renderToStaticMarkup(createElement(SponsorWorkspace,{cities:[{id:"city",name:"Madeira",slug:"madeira"}],walks:[{event,cityId:"city",address:"walk",label:"Madeira · 17 October",start:2,timeZone:"Atlantic/Madeira",status:"upcoming"}],rows:[{event,sponsorship:{version:1,scope:{type:"city",cityId:"city"},mode:"sponsor",sponsorPubkey:"b".repeat(64)}}],busy:false,message:"",refresh:()=>{},onSelect:()=>{},editor:createElement("p",null,"Private display controls")}));
  expect(html).toContain("Cities (1)");expect(html).toContain("Sponsors (1)");expect(html).toContain("Madeira · 17 October");expect(html).toContain('aria-label="Filter walks"');expect(html).toContain(">All</button>");expect(html).toContain(">Next walk</button>");expect(html).toContain(">Upcoming</button>");expect(html).toContain(">Past</button>");expect(html).not.toContain("Walk status");expect(html).toContain('aria-expanded="false"');expect(html).not.toContain("Private display controls");expect(html).not.toContain("Precedence");expect(html).toContain("Invite a sponsor");expect(html).toContain("https://bitcoinwalk.org/sponsor");expect(html).not.toContain("Sponsored walks and recovery files");
 });
 it("selects one next active or future walk per city",()=>{const rows=[{event:{id:"a-later"} as Event,cityId:"a",start:30,status:"upcoming" as const},{event:{id:"a-next"} as Event,cityId:"a",start:20,status:"upcoming" as const},{event:{id:"b-next"} as Event,cityId:"b",start:10,status:"active" as const},{event:{id:"b-past"} as Event,cityId:"b",start:1,status:"past" as const}],next=nextWalkIdsByCity(rows);expect([...next].sort()).toEqual(["a-next","b-next"]);expect(walkMatchesStatus(rows[1],"next",next)).toBe(true);expect(walkMatchesStatus(rows[0],"next",next)).toBe(false);expect(walkMatchesStatus(rows[2],"upcoming",next)).toBe(true);expect(walkMatchesStatus(rows[3],"past",next)).toBe(true);});
});
