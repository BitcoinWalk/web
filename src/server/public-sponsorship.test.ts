import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../payments/runtime",()=>({getPaymentRuntime:vi.fn()}));
vi.mock("../nostr/calendar-records",()=>({calendarOccurrence:()=>({start:100,end:200})}));
vi.mock("../nostr/sponsorships",()=>({calendarAddress:()=>"walk",resolveSponsorship:vi.fn()}));
import {getPaymentRuntime} from "../payments/runtime";
import {resolveSponsorship} from "../nostr/sponsorships";
import {publicSponsorship} from "./public-sponsorship";
const event={id:"event"} as never,sponsor={state:"sponsor" as const,pubkey:"sponsor",logoHash:"approved"};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("BITCOINWALK_PAYMENT_DATABASE","/configured");vi.mocked(resolveSponsorship).mockReturnValue(sponsor);vi.mocked(getPaymentRuntime).mockReturnValue({sponsors:{list:()=>[{cityId:"city",pubkey:"sponsor",status:"paid",count:1,needsReview:false,walks:[{id:"event",address:"walk",start:100}]}]}} as never);});
describe("public page and OG coverage",()=>{
 it("retains approved artwork for an active paid occurrence",()=>{expect(publicSponsorship([],true,"city",event,199)).toEqual(sponsor);});
 it("hides both sponsor and logo at the exact end",()=>{expect(publicSponsorship([],true,"city",event,200)).toEqual({state:"hidden"});});
 it("cannot use a city assignment on unpurchased occurrences",()=>{expect(publicSponsorship([],true,"city",{id:"other"} as never,99)).toEqual({state:"empty"});});
 it("fails closed when the coverage database cannot be read",()=>{vi.mocked(getPaymentRuntime).mockImplementation(()=>{throw new Error("offline");});expect(publicSponsorship([],true,"city",event,99)).toEqual({state:"hidden"});});
 it("preserves the global switch and admin artwork approval",()=>{expect(publicSponsorship([],false,"city",event,99)).toEqual({state:"hidden"});vi.mocked(resolveSponsorship).mockReturnValue({state:"empty"});expect(publicSponsorship([],true,"city",event,99)).toEqual({state:"empty"});});
});
