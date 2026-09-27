import {describe,expect,it} from "vitest";
import {finalizeEvent} from "nostr-tools";
import {mediaRequestTemplate,parseMediaRequest} from "./media-request";
const key=new Uint8Array(32).fill(7),now=2_000_000_000;
describe("signed media requests",()=>{
 it("accepts an exact recent signed import",()=>{const request={action:"import-city-image" as const,cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",sourceUrl:"https://images.example/city.jpg"};expect(parseMediaRequest(finalizeEvent(mediaRequestTemplate(request,now),key),now)).toEqual(request);});
 it("accepts an exact signed generation request",()=>{const request={action:"generate-city-image" as const,cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",cityRevisionId:"a".repeat(64)};expect(parseMediaRequest(finalizeEvent(mediaRequestTemplate(request,now),key),now)).toEqual(request);});
 it("accepts an exact signed replication-status request",()=>{const request={action:"list-replication-status" as const};expect(parseMediaRequest(finalizeEvent(mediaRequestTemplate(request,now),key),now)).toEqual(request);});
 it("rejects expired and altered requests",()=>{const event=finalizeEvent(mediaRequestTemplate({action:"list-media-alerts"},now-301),key);expect(parseMediaRequest(event,now)).toBeNull();expect(parseMediaRequest({...event,content:"{}"},now-301)).toBeNull();});
});
