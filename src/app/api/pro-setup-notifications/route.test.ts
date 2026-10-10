import {afterEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {mediaRequestTemplate} from "../../../domain/media-request";

vi.mock("../../../server/pro-setup",()=>({listProSetupNotifications:vi.fn()}));
import {listProSetupNotifications} from "../../../server/pro-setup";
import {POST} from "./route";

const guide=generateSecretKey();
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe("Pro setup Guide feed",()=>{
 it("rejects unsigned and wrong-action requests before reading private setup state",async()=>{vi.stubEnv("BITCOINWALK_GUIDE_PUBKEY",getPublicKey(guide));expect((await POST(new Request("http://127.0.0.1/api/pro-setup-notifications",{method:"POST",body:"{}"}))).status).toBe(403);const event=finalizeEvent(mediaRequestTemplate({action:"list-directory-notifications"}),guide);expect((await POST(new Request("http://127.0.0.1/api/pro-setup-notifications",{method:"POST",body:JSON.stringify({event})}))).status).toBe(403);expect(listProSetupNotifications).not.toHaveBeenCalled();});
 it("returns only the authorized no-store projection",async()=>{vi.stubEnv("BITCOINWALK_GUIDE_PUBKEY",getPublicKey(guide));vi.mocked(listProSetupNotifications).mockResolvedValue([{cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",cityName:"Madeira",ownerPubkey:"a".repeat(64),state:"setup-required",updatedAt:100}]);const event=finalizeEvent(mediaRequestTemplate({action:"list-pro-setup-notifications"}),guide),response=await POST(new Request("http://127.0.0.1/api/pro-setup-notifications",{method:"POST",body:JSON.stringify({event})}));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect((await response.json()).tasks).toEqual([expect.objectContaining({cityName:"Madeira",state:"setup-required"})]);});
});
