import {afterEach,describe,expect,it,vi} from "vitest";
import {GET} from "./route";

describe("Guide chat configuration",()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it("returns the public Guide identity and verified shared conversations without caching",async()=>{vi.stubEnv("BITCOINWALK_GUIDE_PUBKEY","a".repeat(64));const response=GET();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect(await response.json()).toEqual({version:1,guidePubkey:"a".repeat(64),communities:{global:{relay:"wss://chat.bitcoinwalk.org",groupId:"13bc3a423b4f2954"},hosts:{relay:"wss://chat.bitcoinwalk.org",groupId:"bitcoinwalk-organizers"}}});});
 it("fails closed when the Guide identity is unavailable",async()=>{vi.stubEnv("BITCOINWALK_GUIDE_PUBKEY","");expect(GET().status).toBe(503);});
});
