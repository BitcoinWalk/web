import {describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {announcementContentError,cityAnnouncementCandidate,countryFlag,createCityAnnouncement,matchesCityAnnouncement} from "./city-announcement";
import {createInitialCalendarProposal} from "./calendar-event";
import type {CalendarWalk} from "./calendar-records";

vi.mock("./authority",()=>({isSuperAdmin:()=>true}));

const key=generateSecretKey(),author=getPublicKey(key),cityId="11111111-1111-4111-8111-111111111111",revision={id:"a".repeat(64),pubkey:author},approvalEvent={id:"b".repeat(64)},city={cityId,slug:"funchal",cityName:"Funchal",countryCode:"PT",startAt:"2026-10-25T09:00:00.000Z",description:"Walk",meetingPoint:{description:"Park",latitude:32.65,longitude:-16.9}},event=finalizeEvent(createInitialCalendarProposal(city,"Atlantic/Madeira"),key);
const walk={revision:{event:revision,city},approval:{event:approvalEvent,approval:{cityId,cityRevisionId:revision.id,initialEventId:event.id,status:"approved"}}} as unknown as CalendarWalk;

describe("new-city announcement",()=>{
 it("formats the signed first walk in city-local time with a canonical URL and flag",()=>{const row=cityAnnouncementCandidate(walk,event,["wss://relay.example/"]);expect(countryFlag("pt")).toBe("🇵🇹");expect(row.content).toContain("New chapter of BitcoinWalk starting in Funchal! 🇵🇹");expect(row.content).toContain("Sunday 25 October 2026 09:00");expect(row.url).toMatch(/^https:\/\/bitcoinwalk\.org\/funchal\/nevent1/);});
 it("fails closed without signed country or timezone data",()=>{expect(()=>countryFlag("Portugal")).toThrow("two-letter");expect(()=>cityAnnouncementCandidate({...walk,revision:{...walk.revision,city:{...walk.revision.city,countryCode:undefined}}},event,[])).toThrow("signed country code");});
 it("binds the exact city approval and first walk and rejects a changed event",()=>{const candidate=cityAnnouncementCandidate(walk,event,["wss://relay.example/"]),template=createCityAnnouncement(candidate,10),announcement=finalizeEvent(template,generateSecretKey());expect(matchesCityAnnouncement(announcement,candidate)).toBe(true);expect(matchesCityAnnouncement({...announcement,content:announcement.content+" changed"},candidate)).toBe(false);});
 it("allows reviewed copy edits while preserving the canonical event link",()=>{const candidate=cityAnnouncementCandidate(walk,event,["wss://relay.example/"]),content=`Join our first Funchal BitcoinWalk. Bring a friend!\n\n${candidate.url}`,template=createCityAnnouncement(candidate,10,content),announcement=finalizeEvent(template,key);expect(template.content).toBe(content);expect(matchesCityAnnouncement(announcement,candidate,content)).toBe(true);expect(announcementContentError(content,candidate)).toBeNull();expect(announcementContentError("Join us without the link",candidate)).toContain("event link");expect(()=>createCityAnnouncement(candidate,10,"Join us without the link")).toThrow("event link");});
});
