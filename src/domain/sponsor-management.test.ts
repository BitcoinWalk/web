import {describe,it,expect} from "vitest";
import type {Event} from "nostr-tools";
import type {Sponsorship} from "./sponsorship";
import {sponsorManagementIndex} from "./sponsor-management";
const row=(sponsorship:Sponsorship,time=1)=>({event:{id:String(time).padStart(64,"0"),created_at:time} as Event,sponsorship});
const city={type:"city" as const,cityId:"city"},walk={type:"walk" as const,cityId:"city",address:"walk"};
describe("sponsor management grouping",()=>{
 it("groups inherited and overridden walks under the correct sponsors",()=>{const index=sponsorManagementIndex([row({version:1,scope:city,mode:"sponsor",sponsorPubkey:"a"}),row({version:1,scope:walk,mode:"sponsor",sponsorPubkey:"b"})]);expect(index("city","other").sponsorPubkey).toBe("a");expect(index("city","walk").sponsorPubkey).toBe("b");});
 it("retains hidden placements for management without showing them as active",()=>{const index=sponsorManagementIndex([row({version:1,scope:walk,mode:"sponsor",sponsorPubkey:"b"}),row({version:1,scope:walk,mode:"hidden"},2)]);expect(index("city","walk")).toMatchObject({value:{mode:"hidden"},sponsorPubkey:"b"});});
 it("does not resurrect a cleared walk sponsor or fall back to its city",()=>{const index=sponsorManagementIndex([row({version:1,scope:city,mode:"sponsor",sponsorPubkey:"a"}),row({version:1,scope:walk,mode:"sponsor",sponsorPubkey:"b"}),row({version:1,scope:walk,mode:"empty"},2)]);expect(index("city","walk").sponsorPubkey).toBeUndefined();});
 it("uses the city sponsor after restoring inheritance",()=>{const index=sponsorManagementIndex([row({version:1,scope:city,mode:"sponsor",sponsorPubkey:"a"}),row({version:1,scope:walk,mode:"sponsor",sponsorPubkey:"b"}),row({version:1,scope:walk,mode:"inherit"},2)]);expect(index("city","walk").sponsorPubkey).toBe("a");});
});
