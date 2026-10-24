import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({cities:vi.fn(),resolve:vi.fn(),sponsorship:vi.fn(),logos:vi.fn()}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NOT_FOUND");},redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}}));
vi.mock("../../../server/share-preview",()=>({loadSharedCities:mocks.cities,resolveSharedWalk:mocks.resolve,walkShareMetadata:vi.fn()}));
vi.mock("../../../components/walk-event",()=>({default:({currentProfile,sponsorship}:{currentProfile:{revision:{city:{cityId:string}}};sponsorship:{logoHash?:string}})=><div data-city-id={currentProfile.revision.city.cityId} data-logo-hash={sponsorship.logoHash}/> }));
vi.mock("../../../logos/runtime",()=>({getLogoCatalog:()=>({readyForCity:mocks.logos})}));
vi.mock("../../../nostr/feature-flags",()=>({resolvedFeatureFlags:async()=>({sponsorships:true})}));
vi.mock("../../../nostr/sponsorships",()=>({querySponsorships:async()=>[],calendarAddress:()=>null,sponsorshipPriceOverride:()=>undefined}));
vi.mock("../../../nostr/calendar-records",()=>({calendarOccurrence:()=>null}));
vi.mock("../../../server/public-sponsorship",()=>({publicSponsorship:mocks.sponsorship}));
vi.mock("../../../server/chat-config",()=>({serverChatConfig:()=>undefined}));
import FreeTierEventPage from "./page";

const city=(cityId:string)=>({revision:{event:{id:"a".repeat(64)},city:{cityId,cityName:"Madeira",slug:"madeira"}},approval:{approval:{status:"approved"}}});

describe("canonical city presentation on historical walk links",()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.logos.mockResolvedValue(null);mocks.sponsorship.mockReturnValue({state:"sponsor",pubkey:"c".repeat(64),logoHash:"d".repeat(64)});});
 it("uses the paid canonical Madeira identity for sponsorship resolution",async()=>{
  const canonical=city("83f15504-9fca-4d59-a0f6-616a559510df"),historical=city("ca20993a-5b7f-443e-931e-8dbaa61d05fe"),event={id:"b".repeat(64)};
  mocks.cities.mockResolvedValue([canonical,historical]);mocks.resolve.mockResolvedValue({event,walk:historical,currentProfile:historical});
  const html=renderToStaticMarkup(await FreeTierEventPage({params:Promise.resolve({city:"madeira",event:"nevent1walk"}),searchParams:Promise.resolve({})}));
  expect(mocks.sponsorship).toHaveBeenCalledWith([],true,canonical.revision.city.cityId,event);
  expect(html).toContain(`data-city-id="${canonical.revision.city.cityId}"`);
  expect(html).toContain(`data-logo-hash="${"d".repeat(64)}"`);
 });
});
