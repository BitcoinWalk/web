import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("../../../../nostr/city-records",()=>({parseApprovalRecord:vi.fn(),queryDirectoryRecords:vi.fn(),queryCalendarEvents:vi.fn()}));
vi.mock("../../../../nostr/calendar-records",()=>({calendarOccurrence:vi.fn()}));
vi.mock("../../../../nostr/moderation",()=>({managedCities:vi.fn()}));
vi.mock("../../../../lib/server-relay-config",()=>({serverReadRelays:()=>["ws://127.0.0.1:3334"]}));
vi.mock("../../../../logos/runtime",()=>({getLogoRuntime:vi.fn(),getLogoCatalog:vi.fn()}));
vi.mock("../../../../server/share-image",()=>({managedBackground:vi.fn(),ensureShareImage:vi.fn()}));
vi.mock("../../../../server/share-preview",()=>({shareOrigin:()=>"https://app-staging.bitcoinwalk.org"}));
vi.mock("../../../../payments/runtime",()=>({getPaymentRuntime:vi.fn()}));
vi.mock("../../../../lib/directory-config",()=>({directoryConfig:{paidCities:{}}}));
import {parseApprovalRecord,queryDirectoryRecords} from "../../../../nostr/city-records";
import {managedCities} from "../../../../nostr/moderation";
import {getLogoCatalog,getLogoRuntime} from "../../../../logos/runtime";
import {managedBackground,ensureShareImage} from "../../../../server/share-image";
import {getPaymentRuntime} from "../../../../payments/runtime";
import {POST} from "./route";
const id="a".repeat(64),revisionId="b".repeat(64),cityId="00000000-0000-4000-8000-000000000001",event={id,pubkey:"c".repeat(64)};
const request=()=>new Request("https://example.com/api/admin/city-activation",{method:"POST",body:JSON.stringify({event})});
describe("post-approval city activation",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.mocked(getPaymentRuntime).mockReturnValue({store:{entitled:()=>false}} as never);});
 it("rejects anything except an exact signed approval",async()=>{vi.mocked(parseApprovalRecord).mockReturnValue(null);expect((await POST(request())).status).toBe(403);expect(queryDirectoryRecords).not.toHaveBeenCalled();});
 it("generates logos and localized OG evidence and reports Basic relay as not applicable",async()=>{
  const approval={event,approval:{status:"approved",cityId,cityRevisionId:revisionId,slug:"warszawa",heroImageUrl:"https://app-staging.bitcoinwalk.org/api/media/files/"+"d".repeat(64)+".webp"}},city={cityId,cityName:"Warszawa",slug:"warszawa"},row={state:"approved",decision:approval,revision:{event:{id:revisionId},city}};
  vi.mocked(parseApprovalRecord).mockReturnValue(approval as never);vi.mocked(queryDirectoryRecords).mockResolvedValue({revisions:[],approvals:[]} as never);vi.mocked(managedCities).mockReturnValue([row] as never);
  const tick=vi.fn(),file=vi.fn().mockResolvedValue({data:Buffer.from("localized")}),ready=vi.fn().mockResolvedValue({jobKey:"e".repeat(64),slug:"warszawa",manifest:{files:Array(10).fill({})}});vi.mocked(getLogoRuntime).mockReturnValue({service:{tick}} as never);vi.mocked(getLogoCatalog).mockReturnValue({ready,file} as never);vi.mocked(managedBackground).mockResolvedValue(Buffer.from("hero"));vi.mocked(ensureShareImage).mockResolvedValue("f".repeat(64));
  const response=await POST(request()),body=await response.json();expect(response.status).toBe(200);expect(tick).toHaveBeenCalled();expect(file).toHaveBeenCalledWith("e".repeat(64),"warszawa-bitcoinwalk-on-black.png");expect(ensureShareImage).toHaveBeenCalledWith(Buffer.from("hero"),null,Buffer.from("localized"),"attention");expect(body.checks.logos.status).toBe("green");expect(body.checks.og.url).toContain("f".repeat(64));expect(body.checks.meta.message).toContain("City title");expect(body.checks.relay.status).toBe("na");
 });
 it("does not claim paid relay success before provisioning exists",async()=>{const approval={event,approval:{status:"approved",cityId,cityRevisionId:revisionId,slug:"radom"}},row={state:"approved",decision:approval,revision:{event:{id:revisionId},city:{cityId,cityName:"Radom",slug:"radom"}}};vi.mocked(parseApprovalRecord).mockReturnValue(approval as never);vi.mocked(queryDirectoryRecords).mockResolvedValue({} as never);vi.mocked(managedCities).mockReturnValue([row] as never);vi.mocked(getLogoRuntime).mockReturnValue({service:{tick:vi.fn()}} as never);vi.mocked(getLogoCatalog).mockReturnValue({ready:vi.fn().mockResolvedValue(null)} as never);vi.mocked(getPaymentRuntime).mockReturnValue({store:{entitled:()=>true}} as never);const body=await (await POST(request())).json();expect(body.checks.relay).toMatchObject({status:"amber"});expect(body.checks.relay.message).toContain("not automated yet");});
});
