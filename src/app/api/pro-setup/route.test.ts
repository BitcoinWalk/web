import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {finalizeEvent, generateSecretKey, getPublicKey} from "nostr-tools";
vi.mock("../../../server/pro-setup", () => ({prepareProSetupPreview: vi.fn(),saveProSetupPayout:vi.fn(),saveProSetupSigner:vi.fn(),clearProSetupSigner:vi.fn(),prepareBrandRequest:vi.fn(),submitBrandProofs:vi.fn(),cancelBrandRequest:vi.fn(),listBrandRequests:vi.fn(),reviewBrandRequest:vi.fn(),approveBrandRequest:vi.fn(),prepareBrandPublication:vi.fn(),confirmBrandPublication:vi.fn()}));
vi.mock("../../../server/rustress-activation",()=>({retryManagedProvisioning:vi.fn()}));
import {approveBrandRequest,cancelBrandRequest,clearProSetupSigner,confirmBrandPublication,listBrandRequests,prepareBrandPublication,prepareBrandRequest,prepareProSetupPreview,reviewBrandRequest,saveProSetupPayout,saveProSetupSigner,submitBrandProofs} from "../../../server/pro-setup";
import {citySignerProofTemplate,proSetupTemplate} from "../../../nostr/pro-setup-command";
import {retryManagedProvisioning} from "../../../server/rustress-activation";
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
    vi.mocked(saveProSetupPayout).mockResolvedValue({cityId,version:1,destination:"alice@wallet.example",confirmedAt:1,state:"saved-not-active",update:"not-required",message:"saved"});
    const response=await POST(payoutRequest()),body=await response.json();
    expect(response.status).toBe(200);expect(body.payout).toMatchObject({version:1,state:"saved-not-active"});
    expect(saveProSetupPayout).toHaveBeenCalledWith(cityId,expect.stringMatching(/^[0-9a-f]{64}$/),"alice@wallet.example",expect.objectContaining({kind:27235}));
  });
  it("requires both the owner authorization and exact separate city-signer proof", async () => {
    const ownerKey=generateSecretKey(),secondOwnerKey=generateSecretKey(),brandKey=generateSecretKey(),brandPubkey=getPublicKey(brandKey);
    const command={action:"confirm-city-signer" as const,cityId,brandPubkey,backupAcknowledged:true as const};
    const event=finalizeEvent(proSetupTemplate(command,origin),ownerKey),brandProof=finalizeEvent(citySignerProofTemplate(command,origin),brandKey);
    vi.mocked(saveProSetupSigner).mockResolvedValue({cityId,pubkey:brandPubkey,version:1,state:"confirmed-not-active",message:"saved"});
    expect((await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event})}))).status).toBe(409);
    const secondEvent=finalizeEvent(proSetupTemplate(command,origin),secondOwnerKey),response=await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event:secondEvent,brandProof})}));
    expect(response.status).toBe(200);expect(saveProSetupSigner).toHaveBeenCalledWith(cityId,secondEvent.pubkey,command,expect.objectContaining({id:brandProof.id,pubkey:brandPubkey}),origin);
  });
  it("clears only the saved city signer through the owner-signed command",async()=>{const key=generateSecretKey(),command={action:"clear-city-signer" as const,cityId},event=finalizeEvent(proSetupTemplate(command,origin),key);vi.mocked(clearProSetupSigner).mockResolvedValue({cityId,state:"payout-confirmed",cleared:true,message:"cleared"});const response=await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event})}));expect(response.status).toBe(200);expect(clearProSetupSigner).toHaveBeenCalledWith(cityId,event.pubkey);});
  it("routes the private owner proof workflow without publishing",async()=>{const key=generateSecretKey(),requestId="6302b5c2-b579-4441-a828-9bffce073f97";vi.mocked(prepareBrandRequest).mockResolvedValue({requestId} as never);const command={action:"prepare-brand-request" as const,cityId},event=finalizeEvent(proSetupTemplate(command,origin),key);let response=await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event})}));expect(response.status).toBe(200);expect(prepareBrandRequest).toHaveBeenCalledWith(cityId,event.pubkey,origin);const secondKey=generateSecretKey(),ownerProof=finalizeEvent(proSetupTemplate({action:"preview",cityId},origin),secondKey),brandProof=finalizeEvent(proSetupTemplate({action:"preview",cityId},origin),generateSecretKey());vi.mocked(submitBrandProofs).mockResolvedValue({requestId,expiresAt:1,proofsReady:true,state:"awaiting-super-admin",message:"saved"});const submit={action:"submit-brand-proofs" as const,cityId,requestId},submitEvent=finalizeEvent(proSetupTemplate(submit,origin),secondKey);response=await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event:submitEvent,ownerProof,brandProof})}));expect(response.status).toBe(200);expect(submitBrandProofs).toHaveBeenCalledWith(cityId,requestId,submitEvent.pubkey,expect.objectContaining({id:ownerProof.id}),expect.objectContaining({id:brandProof.id}));});
  it("requires the super-admin command around review and private approval",async()=>{const key=generateSecretKey(),requestId="6302b5c2-b579-4441-a828-9bffce073f97";vi.mocked(listBrandRequests).mockResolvedValue([]);const list={action:"list-brand-requests" as const},listEvent=finalizeEvent(proSetupTemplate(list,origin),key);expect((await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event:listEvent})}))).status).toBe(200);expect(listBrandRequests).toHaveBeenCalledWith(listEvent.pubkey);vi.mocked(reviewBrandRequest).mockResolvedValue({kind:30312,created_at:1,tags:[],content:"{}"});const review={action:"review-brand-request" as const,requestId},reviewEvent=finalizeEvent(proSetupTemplate(review,origin),generateSecretKey());expect((await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event:reviewEvent})}))).status).toBe(200);const approve={action:"approve-brand-request" as const,requestId},approveKey=generateSecretKey(),approveEvent=finalizeEvent(proSetupTemplate(approve,origin),approveKey),binding=finalizeEvent({kind:30312,created_at:1,tags:[],content:"{}"},approveKey);vi.mocked(approveBrandRequest).mockResolvedValue({requestId,eventId:binding.id,state:"approved-not-published",message:"stored"});expect((await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event:approveEvent,approvalEvent:binding})}))).status).toBe(200);expect(approveBrandRequest).toHaveBeenCalledWith(requestId,approveEvent.pubkey,expect.objectContaining({id:binding.id}));expect(cancelBrandRequest).not.toHaveBeenCalled();});
  it("routes publication preparation and independent read-back confirmation separately",async()=>{const requestId="6302b5c2-b579-4441-a828-9bffce073f97",key=generateSecretKey(),eventId="f".repeat(64);vi.mocked(prepareBrandPublication).mockResolvedValue({requestId,event:{} as never,state:"approved",message:"publish"});const prepareEvent=finalizeEvent(proSetupTemplate({action:"prepare-brand-publication",requestId},origin),key);let response=await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event:prepareEvent})}));expect(response.status).toBe(200);expect(prepareBrandPublication).toHaveBeenCalledWith(requestId,prepareEvent.pubkey);vi.mocked(confirmBrandPublication).mockResolvedValue({requestId,eventId,state:"active",relays:["wss://relay.example/"],message:"active"});const confirmEvent=finalizeEvent(proSetupTemplate({action:"confirm-brand-publication",requestId},origin),generateSecretKey());response=await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event:confirmEvent})}));expect(response.status).toBe(200);expect(confirmBrandPublication).toHaveBeenCalledWith(requestId,confirmEvent.pubkey);expect(await response.json()).toMatchObject({request:{state:"active",eventId}});});
  it("routes signed super-admin provisioning recovery",async()=>{const key=generateSecretKey(),event=finalizeEvent(proSetupTemplate({action:"retry-city-provisioning",cityId},origin),key);vi.mocked(retryManagedProvisioning).mockResolvedValue({activationEnabled:false} as never);const response=await POST(new Request(`${origin}/api/pro-setup`,{method:"POST",headers:{origin},body:JSON.stringify({event})}));expect(response.status).toBe(200);expect(retryManagedProvisioning).toHaveBeenCalledWith(cityId,event.pubkey);});
});
