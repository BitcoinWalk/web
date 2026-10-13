import {afterEach,describe,expect,it,vi} from "vitest";

afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
describe("paid-city community endpoint",()=>{
 it("fails closed without configured origin",async()=>{const {POST}=await import("./route");const response=await POST(new Request("https://bitcoinwalk.org/api/monitoring/chats",{method:"POST",headers:{origin:"https://bitcoinwalk.org","content-type":"application/json"},body:"{}"}));expect(response.status).toBe(503);});
 it("rejects cross-origin and unsigned requests before database access",async()=>{vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN","https://bitcoinwalk.org");const {POST}=await import("./route"),request=(origin:string,body="{}")=>new Request("https://bitcoinwalk.org/api/monitoring/chats",{method:"POST",headers:{origin,"content-type":"application/json"},body});expect((await POST(request("https://evil.example"))).status).toBe(403);expect((await POST(request("https://bitcoinwalk.org",JSON.stringify({action:{action:"list"}})))).status).toBe(403);});
});
