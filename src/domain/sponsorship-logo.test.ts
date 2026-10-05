import {describe,it,expect} from "vitest";
import {sponsorshipSchema} from "./sponsorship";
import {resolveSponsorship} from "../nostr/sponsorships";
const cityId="00000000-0000-4000-8000-000000000001",base={version:2 as const,scope:{type:"city" as const,cityId},mode:"sponsor" as const,sponsorPubkey:"a".repeat(64),logoHash:"b".repeat(64)};
describe("signed logo binding",()=>{
 it("accepts v2 hashes and existing v1 without artwork",()=>{expect(sponsorshipSchema.safeParse(base).success).toBe(true);expect(sponsorshipSchema.safeParse({...base,version:1,logoHash:undefined}).success).toBe(true);});
 it.each([{...base,version:1},{...base,logoHash:"https://example.com/logo"},{...base,mode:"hidden"},{...base,version:3}])("rejects invalid logo binding",value=>expect(sponsorshipSchema.safeParse(value).success).toBe(false));
 it("suppresses approved artwork on flag off, expiry and walk override",()=>{const rows=[{event:{id:"a",created_at:1} as never,sponsorship:base}];expect(resolveSponsorship(rows,true,cityId)).toMatchObject({logoHash:base.logoHash});expect(resolveSponsorship(rows,false,cityId)).toEqual({state:"hidden"});expect(resolveSponsorship([{...rows[0],sponsorship:{...base,endsAt:5}}],true,cityId,null,5)).toEqual({state:"empty"});expect(resolveSponsorship([...rows,{event:{id:"c",created_at:2} as never,sponsorship:{version:1,mode:"empty",scope:{type:"walk",cityId,address:"walk"}}}],true,cityId,"walk")).toEqual({state:"empty"});});
});
