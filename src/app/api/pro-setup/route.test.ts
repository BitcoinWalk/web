import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {finalizeEvent, generateSecretKey} from "nostr-tools";
vi.mock("../../../server/pro-setup", () => ({prepareProSetupPreview: vi.fn()}));
import {prepareProSetupPreview} from "../../../server/pro-setup";
import {proSetupTemplate} from "../../../nostr/pro-setup-command";
import {POST} from "./route";
const origin = "https://app-staging.bitcoinwalk.org", cityId = "66f137cb-2ac1-4eef-8358-7dd66b45922f";
function request(key = generateSecretKey(), requestOrigin = origin) {
  return new Request(`${origin}/api/pro-setup`, {method: "POST", headers: {origin: requestOrigin},
    body: JSON.stringify({event: finalizeEvent(proSetupTemplate({action: "preview", cityId}, origin), key)})});
}
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
});
