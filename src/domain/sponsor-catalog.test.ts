import {expect,it} from "vitest";
import {sponsorCatalog} from "./sponsor-catalog";
import type {SponsorshipRevision} from "../nostr/sponsorships";
function row(time:number,cityId:string,mode:"sponsor"|"empty"="sponsor"):SponsorshipRevision{return {event:{id:String(time).padStart(64,"0"),created_at:time},sponsorship:{version:2,scope:{type:"city",cityId},mode,...(mode==="sponsor"?{sponsorPubkey:"a".repeat(64),website:"https://example.com/",logoHash:"b".repeat(64)}:{})}} as SponsorshipRevision;}
it("autocompletes saved sponsor identity, website, logo and its source assignment",()=>{expect(sponsorCatalog([row(1,"city")])).toEqual([{pubkey:"a".repeat(64),website:"https://example.com/",logoHash:"b".repeat(64),cityId:"city",scopeKey:"city:city"}]);});
it("deduplicates sponsors across cities using their newest current assignment",()=>{expect(sponsorCatalog([row(1,"old"),row(2,"new")])).toHaveLength(1);expect(sponsorCatalog([row(1,"old"),row(2,"new")])[0].cityId).toBe("new");});
it("does not resurrect logos from cleared assignments",()=>{expect(sponsorCatalog([row(1,"city"),row(2,"city","empty")])).toEqual([]);});
