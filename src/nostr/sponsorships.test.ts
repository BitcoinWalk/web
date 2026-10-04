import {finalizeEvent} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {createSponsorshipRevision,latestSponsorships,parseSponsorshipRevision,resolveSponsorship} from "./sponsorships";

const key=new Uint8Array(32).fill(1),cityId="be8514a4-9df0-4159-a517-71f65761cbbe",address="walk-1";
function signed(value:Parameters<typeof createSponsorshipRevision>[0],createdAt:number){return finalizeEvent({...createSponsorshipRevision(value),created_at:createdAt},key);}
describe("signed sponsorship assignments",()=>{
 it("rejects records not signed by the super-admin",()=>{expect(parseSponsorshipRevision(signed({version:1,scope:{type:"city",cityId},mode:"empty"},1))).toBeNull();});
 it("resolves walk overrides before city assignments and fails closed behind the flag",()=>{const rows=[
  {event:{id:"a",created_at:1} as never,sponsorship:{version:1 as const,scope:{type:"city" as const,cityId},mode:"sponsor" as const,sponsorPubkey:"a".repeat(64),website:"https://sponsor.example/"}},
  {event:{id:"b",created_at:2} as never,sponsorship:{version:1 as const,scope:{type:"walk" as const,cityId,address},mode:"empty" as const}},
 ];expect(resolveSponsorship(rows,false,cityId,address)).toEqual({state:"hidden"});expect(resolveSponsorship(rows,true,cityId,address)).toEqual({state:"empty"});expect(resolveSponsorship(rows,true,cityId,"other")).toEqual({state:"sponsor",pubkey:"a".repeat(64),website:"https://sponsor.example/"});});
 it("keeps only the newest revision per scope",()=>{const rows=[{event:{id:"b",created_at:2} as never,sponsorship:{version:1 as const,scope:{type:"city" as const,cityId},mode:"empty" as const}},{event:{id:"a",created_at:1} as never,sponsorship:{version:1 as const,scope:{type:"city" as const,cityId},mode:"hidden" as const}}];expect(latestSponsorships(rows)[0].sponsorship.mode).toBe("empty");});
 it("treats an expired sponsor as an open sponsorship",()=>{const rows=[{event:{id:"a",created_at:1} as never,sponsorship:{version:1 as const,scope:{type:"city" as const,cityId},mode:"sponsor" as const,sponsorPubkey:"a".repeat(64),endsAt:10}}];expect(resolveSponsorship(rows,true,cityId,null,10)).toEqual({state:"empty"});});
});
