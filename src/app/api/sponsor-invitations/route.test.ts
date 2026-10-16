import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {POST} from "./route";

const origin="https://app-staging.bitcoinwalk.org";
const request=(body:unknown,source=origin)=>new Request(`${origin}/api/sponsor-invitations`,{method:"POST",headers:{Origin:source,"Content-Type":"application/json"},body:JSON.stringify(body)});

describe("host sponsor invitation gate",()=>{
 beforeEach(()=>{vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN",origin);vi.stubEnv("BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED","");});
 afterEach(()=>vi.unstubAllEnvs());
 it("fails closed before accepting unsigned invitation commands",async()=>{const response=await POST(request({action:"list",event:{}}));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:"Host sponsor invitations are not available yet."});});
 it("fails closed when enabled without an exact city allowlist",async()=>{vi.stubEnv("BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED","1");const response=await POST(request({action:"list",event:{}}));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:"Host sponsor invitations are not available yet."});});
 it("rejects foreign origins even while the feature is disabled",async()=>{expect((await POST(request({action:"list",event:{}},"https://other.example"))).status).toBe(403);});
});
