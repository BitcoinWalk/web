import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey} from "nostr-tools";
import {paymentRequest} from "../../../payments/auth";
import {POST} from "./route";
const service=vi.hoisted(()=>({create:vi.fn(),status:vi.fn(),list:vi.fn(()=>[])}));
vi.mock("../../../payments/runtime",()=>({getPaymentRuntime:()=>({service})}));
const origin="https://app-staging.bitcoinwalk.org";
beforeEach(()=>{vi.clearAllMocks();service.list.mockReturnValue([]);vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN",origin);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const request=(event:unknown,source=origin)=>new Request(`${origin}/api/payments`,{method:"POST",headers:{Origin:source},body:JSON.stringify({event})});
describe("direct app payment API",()=>{
 it("rejects unsigned requests before accessing payment state",async()=>{expect((await POST(request({}))).status).toBe(403);expect(service.list).not.toHaveBeenCalled();});
 it("rejects foreign origins",async()=>{expect((await POST(request({},"https://other.example"))).status).toBe(403);});
 it("handles a validated signed request inside the web app",async()=>{const event=finalizeEvent(paymentRequest({action:"list"},origin),generateSecretKey());const result=await POST(request(event));expect(result.status).toBe(200);expect(service.list).toHaveBeenCalledOnce();expect(result.headers.get("Cache-Control")).toBe("no-store");});
 it("fails closed when unconfigured",async()=>{vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN","");expect((await POST(request({}))).status).toBe(503);});
 it("suppresses wallet and database exception text",async()=>{service.list.mockImplementationOnce(()=>{throw new Error("nostr+walletconnect://private-key fixture");});const event=finalizeEvent(paymentRequest({action:"list"},origin),generateSecretKey());const result=await POST(request(event));expect(result.status).toBe(503);expect(await result.text()).not.toContain("private-key");});
 it("rejects oversized requests before accessing payment state",async()=>{const result=await POST(new Request(`${origin}/api/payments`,{method:"POST",headers:{Origin:origin},body:"x".repeat(32769)}));expect(result.status).toBe(503);expect(service.list).not.toHaveBeenCalled();});
});

