import {afterEach,describe,expect,it,vi} from "vitest";
import {generateSecretKey,getPublicKey,finalizeEvent} from "nostr-tools";
import {mediaRequestTemplate} from "../../../domain/media-request";
vi.mock("../../../server/guide-support-access",()=>({guideSupportPlan:vi.fn()}));
import {guideSupportPlan} from "../../../server/guide-support-access";
import {POST} from "./route";
const guide=generateSecretKey(),recipientPubkey="b".repeat(64),request=(body:unknown)=>new Request("http://127.0.0.1/api/guide-support-access",{method:"POST",body:JSON.stringify(body)});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
describe("Guide access projection",()=>{
 it("requires the exact Guide-signed action before reading entitlements",async()=>{vi.stubEnv("BITCOINWALK_GUIDE_PUBKEY",getPublicKey(guide));expect((await POST(request({}))).status).toBe(403);const event=finalizeEvent(mediaRequestTemplate({action:"guide-support-access",recipientPubkey}),generateSecretKey());expect((await POST(request({event}))).status).toBe(403);expect(guideSupportPlan).not.toHaveBeenCalled();});
 it("returns only a no-store verified plan and fails closed on incomplete reads",async()=>{vi.stubEnv("BITCOINWALK_GUIDE_PUBKEY",getPublicKey(guide));const event=finalizeEvent(mediaRequestTemplate({action:"guide-support-access",recipientPubkey}),guide);vi.mocked(guideSupportPlan).mockResolvedValue("pro");const response=await POST(request({event}));expect(await response.json()).toEqual({version:1,plan:"pro"});expect(response.headers.get("cache-control")).toBe("no-store");expect(guideSupportPlan).toHaveBeenCalledWith(recipientPubkey);vi.mocked(guideSupportPlan).mockRejectedValue(new Error("unavailable"));expect((await POST(request({event}))).status).toBe(503);});
});
