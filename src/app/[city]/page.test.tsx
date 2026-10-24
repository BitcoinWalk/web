import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,describe,expect,it,vi} from "vitest";
import type {CalendarSource} from "../../nostr/calendar-records";

const mocks=vi.hoisted(()=>({cities:vi.fn(),events:vi.fn(),next:vi.fn(),logos:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NOT_FOUND");},redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}}));
vi.mock("../../server/share-preview",()=>({loadSharedCities:mocks.cities,assignedSponsorShareImage:vi.fn(),cityShareMetadata:vi.fn()}));
vi.mock("../../nostr/content-records",()=>({queryContentRevisions:async()=>[],contentRoute:()=>null}));
vi.mock("../../nostr/city-records",()=>({queryCalendarEvents:mocks.events}));
vi.mock("../../domain/event-routing",()=>({currentOrNextEventAcrossSources:mocks.next,paidCityForHost:()=>null}));
vi.mock("../../nostr/feature-flags",()=>({resolvedFeatureFlags:async()=>({sponsorships:false})}));
vi.mock("../../nostr/sponsorships",()=>({querySponsorships:async()=>[]}));
vi.mock("../../logos/runtime",()=>({getLogoCatalog:()=>({readyForCity:mocks.logos})}));
vi.mock("../../components/public-city-host",()=>({default:()=> <section>City host</section>}));
vi.mock("../../components/public-city-support",()=>({default:()=> <section>City support</section>}));
vi.mock("../../components/city-chat",()=>({default:()=> <section>City community</section>}));
vi.mock("../../server/chat-config",()=>({serverChatConfig:()=>undefined}));
import CityPage from "./page";

function source(cityName:string):CalendarSource {
  const slug=cityName.toLowerCase();
  return {revision:{event:{id:"1".repeat(64)},city:{cityId:`${slug}-id`,cityName,slug,description:`Discover ${cityName} on foot.`,heroImageUrl:`https://example.com/${slug}.jpg`,meetingPoint:{description:"Town square",latitude:1,longitude:2}}},approval:{approval:{status:"approved"}}} as CalendarSource;
}

describe("all approved city pages use the current layout",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.events.mockResolvedValue([]);mocks.next.mockReturnValue(null);mocks.logos.mockResolvedValue(null);});
  it.each(["Austin","Augsburg","Barcelona","Madeira"])("shows the full city layout without a scheduled walk in %s",async cityName=>{
    const row=source(cityName);mocks.cities.mockResolvedValue([row]);
    const html=renderToStaticMarkup(await CityPage({params:Promise.resolve({city:row.revision.city.slug}),searchParams:Promise.resolve({view:"app"})}));
    expect(html).toMatch(/<main class="[^"]*page[^"]*app/);
    expect(html).toContain('class="event-hero"');
    expect(html).toContain(`https://example.com/${row.revision.city.slug}.jpg`);
    expect(html).toContain(`Discover ${cityName} on foot.`);
    expect(html).toContain("Town square");
    expect(html).toContain("No upcoming walk has been scheduled.");
    expect(html).toContain('aria-label="Walk details and community"');
    expect(html).toContain("City host");expect(html).toContain("City support");expect(html).toContain("City community");
    expect(html).not.toContain("<time");
    expect(mocks.logos).toHaveBeenCalledWith({cityId:row.revision.city.cityId,slug:row.revision.city.slug});
  });
  it("keeps the same layout on the website without app-only styling",async()=>{
    mocks.cities.mockResolvedValue([source("Austin")]);
    const html=renderToStaticMarkup(await CityPage({params:Promise.resolve({city:"austin"}),searchParams:Promise.resolve({})}));
    expect(html).toMatch(/<main class="[^"]*page[^"]* ">/);
    expect(html).toContain("Browse BitcoinWalks");
  });
  it("preserves an app's selected city when following its canonical alias",async()=>{
    const row=source("Austin");row.revision.city.aliases=["Old Austin"];
    mocks.cities.mockResolvedValue([row]);
    await expect(CityPage({params:Promise.resolve({city:"old-austin"}),searchParams:Promise.resolve({view:"app"})})).rejects.toThrow("REDIRECT:/austin?view=app");
  });
  it("looks up the next walk across equivalent approved Madeira identities",async()=>{
    const canonical=source("Madeira"),historical=source("Madeira");historical.revision.city.cityId="historical-madeira-id";
    const event={id:"e".repeat(64)};mocks.cities.mockResolvedValue([canonical,historical]);mocks.events.mockResolvedValue([event]);mocks.next.mockReturnValue(event);
    await expect(CityPage({params:Promise.resolve({city:"madeira"}),searchParams:Promise.resolve({})})).rejects.toThrow("REDIRECT:/madeira/nevent1");
    expect(mocks.events).toHaveBeenCalledWith(expect.any(Array),{cityIds:["madeira-id","historical-madeira-id"]});
    expect(mocks.next).toHaveBeenCalledWith([canonical,historical],[event]);
  });
});
