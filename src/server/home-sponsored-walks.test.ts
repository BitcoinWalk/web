import {beforeEach,describe,expect,it,vi} from "vitest";

vi.mock("../nostr/calendar-records",()=>({approvedCalendarWalks:vi.fn(),calendarNevent:()=>"nevent1walk",initialCalendarHero:()=>undefined}));
vi.mock("../nostr/city-records",()=>({queryCalendarEvents:vi.fn(),queryDirectoryRecords:vi.fn()}));
vi.mock("../nostr/feature-flags",()=>({resolvedFeatureFlags:vi.fn()}));
vi.mock("../nostr/sponsorships",()=>({calendarAddress:()=>"walk-address",querySponsorships:vi.fn()}));
vi.mock("../domain/event-routing",()=>({managedCalendarEvents:vi.fn()}));
vi.mock("../lib/server-relay-config",()=>({serverReadRelays:()=>["ws://127.0.0.1:3334"]}));
vi.mock("./public-sponsorship",()=>({publicSponsorship:vi.fn()}));
vi.mock("./share-preview",()=>({assignedSponsorShareImage:vi.fn(),renderedShareImage:vi.fn()}));

import {approvedCalendarWalks} from "../nostr/calendar-records";
import {queryCalendarEvents,queryDirectoryRecords} from "../nostr/city-records";
import {resolvedFeatureFlags} from "../nostr/feature-flags";
import {querySponsorships} from "../nostr/sponsorships";
import {managedCalendarEvents} from "../domain/event-routing";
import {publicSponsorship} from "./public-sponsorship";
import {assignedSponsorShareImage,renderedShareImage} from "./share-preview";
import {loadHomeSponsoredWalks} from "./home-sponsored-walks";

const event={id:"b".repeat(64),pubkey:"c".repeat(64),kind:31923,created_at:1,content:"",sig:"d".repeat(128),tags:[["d","walk-address"]]};
const walk={revision:{city:{cityId:"00000000-0000-4000-8000-000000000001",cityName:"Madeira",slug:"madeira",meetingPoint:{description:"Park"}}},approval:{approval:{}}};

beforeEach(()=>{
 vi.resetAllMocks();
 vi.mocked(resolvedFeatureFlags).mockResolvedValue({featuredCityWalks:true} as never);
 vi.mocked(queryDirectoryRecords).mockResolvedValue({revisions:[],approvals:[]} as never);
 vi.mocked(queryCalendarEvents).mockResolvedValue([event] as never);
 vi.mocked(querySponsorships).mockResolvedValue([]);
 vi.mocked(approvedCalendarWalks).mockReturnValue([walk] as never);
 vi.mocked(managedCalendarEvents).mockReturnValue([{event,start:2_000_000_000,end:2_000_003_600,timeZone:"Atlantic/Madeira",meetingPoint:{description:"Park",latitude:1,longitude:1},status:"upcoming"}] as never);
 vi.mocked(publicSponsorship).mockReturnValue({state:"sponsor",pubkey:"a".repeat(64),logoHash:"e".repeat(64)});
 vi.mocked(assignedSponsorShareImage).mockResolvedValue("https://bitcoinwalk.org/api/og/files/sponsored.jpg");
});

describe("loadHomeSponsoredWalks",()=>{
 it("returns only server-verified future sponsorships with canonical walk links",async()=>{
  const result=await loadHomeSponsoredWalks(1_900_000_000);
  expect(result).toEqual([expect.objectContaining({cityName:"Madeira",href:"/madeira/nevent1walk",imageUrl:"https://bitcoinwalk.org/api/og/files/sponsored.jpg",sponsorPubkey:"a".repeat(64),start:2_000_000_000})]);
  expect(publicSponsorship).toHaveBeenCalledWith([],true,walk.revision.city.cityId,event,1_900_000_000,"og");
 });
 it("fails closed when the feature flag or approved logo assignment is absent",async()=>{
  vi.mocked(resolvedFeatureFlags).mockResolvedValueOnce({featuredCityWalks:false} as never);
  expect(await loadHomeSponsoredWalks()).toEqual([]);
  vi.mocked(publicSponsorship).mockReturnValue({state:"empty"});
  expect(await loadHomeSponsoredWalks()).toEqual([]);
 });
 it("uses ordinary city artwork when sponsored rendering is temporarily unavailable",async()=>{
  vi.mocked(assignedSponsorShareImage).mockResolvedValue(undefined);
  vi.mocked(renderedShareImage).mockResolvedValue("https://bitcoinwalk.org/api/og/files/default.jpg");
  expect((await loadHomeSponsoredWalks())[0]?.imageUrl).toContain("default.jpg");
 });
});
