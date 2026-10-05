import {describe,expect,it} from "vitest";
import {finalizeEvent} from "nostr-tools";
import {mediaRequestTemplate,parseMediaRequest} from "./media-request";
const key=new Uint8Array(32).fill(7),now=2_000_000_000;
describe("signed media requests",()=>{
 it("binds a sponsor upload to its identity, city, MIME and file hash",()=>{const request={action:"upload-sponsor-logo" as const,cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",sponsorPubkey:"a".repeat(64),sha256:"b".repeat(64),mime:"image/svg+xml" as const};const event=finalizeEvent(mediaRequestTemplate(request,now),key);expect(parseMediaRequest(event,now)).toEqual(request);expect(parseMediaRequest(JSON.parse(JSON.stringify({...event,content:JSON.stringify({...request,sha256:"c".repeat(64)})})),now)).toBeNull();});
 it("binds pending logo preparation to the exact signed city revision and chosen slug",()=>{const request={action:"prepare-city-logo" as const,cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",revisionId:"b".repeat(64),slug:"new-city"};const event=finalizeEvent(mediaRequestTemplate(request,now),key);expect(parseMediaRequest(event,now)).toEqual(request);expect(parseMediaRequest(JSON.parse(JSON.stringify({...event,content:JSON.stringify({...request,slug:"../city"})})),now)).toBeNull();});
 it("accepts an exact recent signed import",()=>{const request={action:"import-city-image" as const,cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",sourceUrl:"https://images.example/city.jpg"};expect(parseMediaRequest(finalizeEvent(mediaRequestTemplate(request,now),key),now)).toEqual(request);});
 it("accepts an exact signed generation request",()=>{const request={action:"generate-city-image" as const,cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",cityRevisionId:"a".repeat(64)};expect(parseMediaRequest(finalizeEvent(mediaRequestTemplate(request,now),key),now)).toEqual(request);});
 it("accepts an exact signed replication-status request",()=>{const request={action:"list-replication-status" as const};expect(parseMediaRequest(finalizeEvent(mediaRequestTemplate(request,now),key),now)).toEqual(request);});
 it("rejects expired and altered requests",()=>{const event=finalizeEvent(mediaRequestTemplate({action:"list-media-alerts"},now-301),key);expect(parseMediaRequest(event,now)).toBeNull();expect(parseMediaRequest({...event,content:"{}"},now-301)).toBeNull();});
});
