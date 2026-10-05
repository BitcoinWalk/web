import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("react",()=>({cache:(fn:unknown)=>fn}));
vi.mock("../nostr/calendar-records",()=>({resolveCalendarLink:vi.fn(),loadCalendarWalks:vi.fn(),calendarOccurrence:vi.fn(),initialCalendarHero:()=>undefined}));
vi.mock("../lib/server-relay-config",()=>({serverReadRelays:()=>[]}));
vi.mock("./share-image",()=>({ensureShareImage:vi.fn(),managedBackground:vi.fn(),bundledCityBackground:async()=>null}));
vi.mock("./share-sponsor",()=>({shareSponsor:async()=>null}));
import {resolveCalendarLink,calendarOccurrence,loadCalendarWalks} from "../nostr/calendar-records";
import {ensureShareImage} from "./share-image";
import {cityShareMetadata,walkShareMetadata} from "./share-preview";
beforeEach(()=>{vi.resetAllMocks();});
describe("server share metadata",()=>{
 it("does not expose unknown or mismatched walks",async()=>{expect((await walkShareMetadata("private","nevent")).robots).toEqual({index:false,follow:false});expect(ensureShareImage).not.toHaveBeenCalled();});
 it("returns safe metadata when relay resolution fails",async()=>{vi.mocked(resolveCalendarLink).mockRejectedValue(new Error("offline"));expect((await walkShareMetadata("city","event")).title).toBe("BitcoinWalk | Walk unavailable");});
 it("uses a static image when rendering fails",async()=>{const city={cityName:"Barcelona",slug:"barcelona"};const walk={revision:{city},approval:{approval:{}}};vi.mocked(loadCalendarWalks).mockResolvedValue([walk] as never);vi.mocked(ensureShareImage).mockRejectedValue(new Error("full"));const result=await cityShareMetadata("barcelona");expect(result.title).toContain("Barcelona");expect(JSON.stringify(result.openGraph)).toContain("bitcoinwalk-share-fallback.jpg");expect(result.alternates?.canonical).toBe("https://app-staging.bitcoinwalk.org/barcelona");});
 it("emits matching OG and Twitter text plus saved image URL",async()=>{const walk={revision:{city:{cityName:"Barcelona",slug:"barcelona"}},approval:{approval:{}}};vi.mocked(resolveCalendarLink).mockResolvedValue({event:{tags:[]},walk,currentProfile:walk} as never);vi.mocked(calendarOccurrence).mockReturnValue({start:2000000000,end:2000003600,timeZone:"Europe/Madrid",meetingPoint:{description:"Park"}} as never);vi.mocked(ensureShareImage).mockResolvedValue("a".repeat(64));const result=await walkShareMetadata("barcelona","nevent");expect(result.openGraph?.title).toBe(result.title);expect(result.twitter?.description).toBe(result.description);expect(JSON.stringify(result.openGraph)).toContain(`/api/og/files/${"a".repeat(64)}.jpg`);});
});
