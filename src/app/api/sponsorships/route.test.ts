import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey} from "nostr-tools";
import {sponsorRequest} from "../../../payments/sponsor-auth";
import {POST} from "./route";
const sponsors=vi.hoisted(()=>({create:vi.fn(),status:vi.fn(),claim:vi.fn(),list:vi.fn(),available:vi.fn()}));
vi.mock("../../../payments/runtime",()=>({getPaymentRuntime:()=>({sponsors})}));
const origin="https://app-staging.bitcoinwalk.org",id="00000000-0000-4000-8000-000000000001",token="ab".repeat(32);
const request=(body:unknown,source=origin)=>new Request(origin+"/api/sponsorships",{method:"POST",headers:{Origin:source},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN",origin);});afterEach(()=>vi.unstubAllEnvs());
describe("sponsor checkout authorization",()=>{
 it("rejects foreign origins and invalid unsigned admin access",async()=>{expect((await POST(request({action:"list",event:{}},"https://other.example"))).status).toBe(403);expect((await POST(request({action:"list",event:{}}))).status).toBe(403);expect(sponsors.list).not.toHaveBeenCalled();});
 it("does not allow an ordinary valid signer to list all payments",async()=>{const event=finalizeEvent(sponsorRequest("list",origin),generateSecretKey());expect((await POST(request({action:"list",event}))).status).toBe(403);expect(sponsors.list).not.toHaveBeenCalled();});
 it("rejects client supplied prices",async()=>{expect((await POST(request({action:"create",token,cityId:id,count:1,ids:["ab".repeat(32)],amountMsat:1}))).status).toBe(400);expect(sponsors.create).not.toHaveBeenCalled();});
 it("requires a signature bound to the same paid order for claim",async()=>{const event=finalizeEvent(sponsorRequest("claim",origin,"different"),generateSecretKey());expect((await POST(request({action:"claim",id,token,event}))).status).toBe(403);expect(sponsors.claim).not.toHaveBeenCalled();});
 it("does not expose wallet errors or keys",async()=>{sponsors.status.mockRejectedValue(new Error("nostr+walletconnect://secret"));const result=await POST(request({action:"status",id,token}));expect(await result.text()).not.toContain("secret");});
});
