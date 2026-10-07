import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {finalizeEvent, generateSecretKey} from "nostr-tools";
vi.mock("../../../server/pro-setup", () => ({prepareProSetupPreview: vi.fn(),saveProSetupPayout:vi.fn()}));
import {prepareProSetupPreview,saveProSetupPayout} from "../../../server/pro-setup";
import {proSetupTemplate} from "../../../nostr/pro-setup-command";
import {POST} from "./route";
const origin = "https://app-staging.bitcoinwalk.org", cityId = "66f137cb-2ac1-4eef-8358-7dd66b45922f";
function request(key = generateSecretKey(), requestOrigin = origin) {
  return new Request(`${origin}/api/pro-setup`, {method: "POST", headers: {origin: requestOrigin},
    body: JSON.stringify({event: finalizeEvent(proSetupTemplate({action: "preview", cityId}, origin), key)})});
}
function payoutRequest(key = generateSecretKey()) {return new Request(`${origin}/api/pro-setup`, {method:"POST",headers:{origin},body:JSON.stringify({event:finalizeEvent(proSetupTemplate({action:"save-payout",cityId,destination:"alice@wallet.example"},origin),key)})});}
beforeEach(() => {vi.clearAllMocks(); vi.stubEnv("BITCOINWALK_PRO_SETUP_PREVIEW", "true"); vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN", origin);});
afterEach(() => vi.unstubAllEnvs());
describe("Pro setup preview API", () => {
  it("stays disabled by default and never resolves private data before authentication", async () => {
    vi.stubEnv("BITCOINWALK_PRO_SETUP_PREVIEW", "false");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("BITCOINWALK_PRO_SETUP_PREVIEW", "true");
    expect((await POST(request(undefined, "https://evil.example"))).status).toBe(403);
    expect((await POST(new Request(`${origin}/api/pro-setup`, {method: "POST", headers: {origin}, body: "{}"}))).status).toBe(403);
    expect(prepareProSetupPreview).not.toHaveBeenCalled();
  });
  it("returns a private no-store preview and bounds repeated relay reads", async () => {
    vi.mocked(prepareProSetupPreview).mockResolvedValue({cityId, status: "preparation-only"} as never);
    const key = generateSecretKey(), response = await POST(request(key));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({preview: {cityId, status: "preparation-only"}});
    expect((await POST(request(key))).status).toBe(429);
    expect(prepareProSetupPreview).toHaveBeenCalledTimes(1);
  });
  it("does not expose internal configuration or database errors", async () => {
    vi.mocked(prepareProSetupPreview).mockRejectedValue(new Error("private secret database error"));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("private secret");
  });
  it("saves only the exact owner-signed payout request and does not claim activation", async()=>{
    vi.mocked(saveProSetupPayout).mockResolvedValue({cityId,version:1,destination:"alice@wallet.example",confirmedAt:1,state:"saved-not-active",message:"saved"});
    const response=await POST(payoutRequest()),body=await response.json();
    expect(response.status).toBe(200);expect(body.payout).toMatchObject({version:1,state:"saved-not-active"});
    expect(saveProSetupPayout).toHaveBeenCalledWith(cityId,expect.stringMatching(/^[0-9a-f]{64}$/),"alice@wallet.example",expect.objectContaining({kind:27235}));
  });
});
