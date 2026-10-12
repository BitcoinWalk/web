import {beforeEach,describe,expect,it,vi} from "vitest";
import type {Event} from "nostr-tools";
import type {ManagedCalendarEvent} from "../domain/event-routing";
import type {CalendarWalk} from "../nostr/calendar-records";

vi.mock("../lib/server-relay-config",()=>({serverReadRelays:()=>["ws://127.0.0.1:3334/"]}));
vi.mock("../lib/relay-config",()=>({relayConfig:{calendarRelayHints:["wss://relay.bitcoinwalk.org/"]}}));
vi.mock("../nostr/calendar-records",()=>({
 loadCalendarWalks:vi.fn(),
 calendarNevent:(event:{id:string})=>`nevent-${event.id}`,
 initialCalendarHero:vi.fn(()=>"https://bitcoinwalk.org/initial.webp"),
}));
vi.mock("../nostr/city-records",()=>({queryCalendarEvents:vi.fn()}));
vi.mock("../nostr/sponsorships",()=>({querySponsorships:vi.fn()}));
vi.mock("../domain/event-routing",()=>({managedCalendarEvents:vi.fn()}));
vi.mock("./public-sponsorship",()=>({publicSponsorship:vi.fn()}));
vi.mock("./sponsor-logo-store",()=>({readSponsorLogoAsset:vi.fn()}));
vi.mock("./share-preview",()=>({renderedShareImage:vi.fn(),shareOrigin:()=>"https://bitcoinwalk.org"}));

import {managedCalendarEvents} from "../domain/event-routing";
import {loadCalendarWalks} from "../nostr/calendar-records";
import {queryCalendarEvents} from "../nostr/city-records";
import {querySponsorships} from "../nostr/sponsorships";
import {publicSponsorship} from "./public-sponsorship";
import {readSponsorLogoAsset} from "./sponsor-logo-store";
import {renderedShareImage} from "./share-preview";
import {loadPublicEventsFeed} from "./public-events-feed";

const now=1_800_000_000;
const city={cityId:"be8514a4-9df0-4159-a517-71f65761cbbe",cityName:"Warszawa",slug:"warszawa",heroImageUrl:"https://bitcoinwalk.org/current.webp"};
const walk={revision:{city},approval:{approval:{heroImageUrl:"https://bitcoinwalk.org/approved.webp"}}} as unknown as CalendarWalk;
const event={id:"a".repeat(64),content:"A friendly BitcoinWalk.",tags:[["title","BitcoinWalk Warszawa"]]} as unknown as Event;
const item={event,start:now+3600,end:now+7200,timeZone:"Europe/Warsaw",meetingPoint:{description:"Example Café",latitude:52.23,longitude:21.01},status:"upcoming"} as ManagedCalendarEvent;

beforeEach(()=>{
 vi.resetAllMocks();
 vi.mocked(loadCalendarWalks).mockResolvedValue([walk]);
 vi.mocked(queryCalendarEvents).mockResolvedValue([event]);
 vi.mocked(querySponsorships).mockResolvedValue([]);
 vi.mocked(managedCalendarEvents).mockReturnValue([item]);
 vi.mocked(publicSponsorship).mockReturnValue({state:"sponsor",pubkey:"b".repeat(64),logoHash:"c".repeat(64)});
 vi.mocked(readSponsorLogoAsset).mockResolvedValue(Buffer.from("logo"));
 vi.mocked(renderedShareImage).mockResolvedValue("https://bitcoinwalk.org/api/og/files/image.jpg");
});

describe("public future-events feed",()=>{
 it("projects verified upcoming Nostr walks with the current sponsor-aware OG image",async()=>{
  const feed=await loadPublicEventsFeed(now);
  expect(queryCalendarEvents).toHaveBeenCalledWith(["ws://127.0.0.1:3334/"],{cityIds:[city.cityId]});
  expect(publicSponsorship).toHaveBeenCalledWith([],true,city.cityId,event,now,"og");
  expect(renderedShareImage).toHaveBeenCalledWith(city.cityId,city.slug,["https://bitcoinwalk.org/approved.webp","https://bitcoinwalk.org/current.webp","https://bitcoinwalk.org/initial.webp"],Buffer.from("logo"));
  expect(feed).toEqual({version:1,generatedAt:new Date(now*1000).toISOString(),events:[{
   id:event.id,name:"BitcoinWalk Warszawa",description:"A friendly BitcoinWalk.",startDate:new Date((now+3600)*1000).toISOString(),endDate:new Date((now+7200)*1000).toISOString(),timeZone:"Europe/Warsaw",link:`https://bitcoinwalk.org/warszawa/nevent-${event.id}`,address:"Example Café",latitude:52.23,longitude:21.01,image:"https://bitcoinwalk.org/api/og/files/image.jpg",
  }]});
 });
 it("publishes only upcoming rows and returns an empty feed without querying unrelated events",async()=>{
  vi.mocked(managedCalendarEvents).mockReturnValue([{...item,status:"active"},{...item,event:{...event,id:"d".repeat(64)},status:"past"}] as never);
  expect((await loadPublicEventsFeed(now)).events).toEqual([]);
  vi.mocked(loadCalendarWalks).mockResolvedValue([]);
  expect((await loadPublicEventsFeed(now)).events).toEqual([]);
  expect(queryCalendarEvents).toHaveBeenCalledTimes(1);
 });
 it("rejects a relay result at the safe completeness boundary",async()=>{
  vi.mocked(queryCalendarEvents).mockResolvedValue(Array.from({length:500},()=>event));
  await expect(loadPublicEventsFeed(now)).rejects.toThrow("safe relay read limit");
 });
});
