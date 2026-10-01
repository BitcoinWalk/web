import {describe,expect,it} from "vitest";
import {creatorSubmissions} from "./creator-submissions";
import type {CityRevision} from "../nostr/city-records";
import {ARCHIVE_NOTE} from "../nostr/moderation";
const owner="a".repeat(64),city=(id:string,name:string,time:number,tier:"free"|"paid"="free")=>({event:{id:String(time).padStart(64,"0"),pubkey:owner,created_at:time},city:{cityId:id,cityName:name,slug:name.toLowerCase(),requestedTier:tier}} as unknown as CityRevision);
const decision=(revision:ReturnType<typeof city>,status:"approved"|"rejected"|"revoked",time:number,note?:string)=>({event:{id:String(time).padStart(64,"f"),created_at:time},approval:{cityId:revision.city.cityId,cityRevisionId:revision.event.id,status,note}} as never);
describe("creator submission summary",()=>{
 it("shows the newest creator revision and its exact decision",()=>{const old=city("11111111-1111-4111-8111-111111111111","Austin",1),latest=city(old.city.cityId,"Austin",2,"paid");expect(creatorSubmissions(owner,[old,latest],[decision(old,"approved",3)])).toEqual([{cityId:latest.city.cityId,cityName:"Austin",slug:"austin",tier:"paid",revisionId:latest.event.id,status:"awaiting-approval"}]);expect(creatorSubmissions(owner,[latest],[decision(latest,"rejected",4)])[0].status).toBe("needs-changes");});
 it("reports a city-wide archive separately from a rejected revision",()=>{const norilsk=city("22222222-2222-4222-8222-222222222222","Norilsk",1);expect(creatorSubmissions(owner,[norilsk],[decision(norilsk,"approved",2),decision(norilsk,"revoked",3,ARCHIVE_NOTE)])[0].status).toBe("archived");});
});
