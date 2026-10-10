import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("../../../payments/runtime",()=>({getPaymentRuntime:vi.fn()}));
import {getPaymentRuntime} from "../../../payments/runtime";
import {POST} from "./route";

const origin="https://app-staging.bitcoinwalk.org",cityId="be8514a4-9df0-4159-a517-71f65761cbbe",revisionId="b".repeat(64),token="c".repeat(64);
const createGift=vi.fn(),giftStatus=vi.fn();
function call(body:unknown,requestOrigin=origin){return POST(new Request(`${origin}/api/city-upgrades`,{method:"POST",headers:{Origin:requestOrigin,"Content-Type":"application/json"},body:JSON.stringify(body)}));}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN",origin);vi.mocked(getPaymentRuntime).mockReturnValue({service:{createGift,giftStatus}} as never);createGift.mockResolvedValue({cityId,status:"pending",tier:"free",invoice:"lnbc",expiresAt:10});giftStatus.mockResolvedValue({cityId,status:"paid",tier:"paid",expiresAt:10});});
describe("public city upgrade checkout",()=>{
 it("creates a token-bound gift without a signer or payout destination",async()=>{const response=await call({action:"create",cityId,revisionId,token});expect(response.status).toBe(200);expect(createGift).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/),cityId,revisionId);expect(await response.json()).toMatchObject({payment:{tier:"free"}});});
 it("checks only the same private browser token",async()=>{const response=await call({action:"status",cityId,revisionId,token:"d".repeat(64)});expect(response.status).toBe(200);expect(giftStatus).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/),cityId);});
 it("rejects cross-origin, malformed and rapid duplicate requests",async()=>{expect((await call({action:"create",cityId,revisionId,token},"https://evil.example")).status).toBe(403);expect((await call({action:"create",cityId,revisionId,token:"bad"})).status).toBe(503);const fresh="e".repeat(64);expect((await call({action:"create",cityId,revisionId,token:fresh})).status).toBe(200);expect((await call({action:"create",cityId,revisionId,token:fresh})).status).toBe(429);});
});
