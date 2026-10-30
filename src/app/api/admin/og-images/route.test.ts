import { beforeEach,describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
vi.mock("server-only", () => ({}));
vi.mock("../../../../nostr/authority",()=>({isSuperAdmin:vi.fn()}));
vi.mock("../../../../lib/server-relay-config",()=>({serverReadRelays:()=>["wss://relay.example/"]}));
vi.mock("../../../../nostr/calendar-records",async importOriginal=>{
  const actual=await importOriginal<typeof import("../../../../nostr/calendar-records")>();
  return {...actual,loadCalendarWalks:vi.fn()};
});
vi.mock("../../../../nostr/sponsor-catalogue",()=>({querySponsorCatalogue:vi.fn(),sponsorCatalogueEntries:vi.fn()}));
vi.mock("../../../../server/og-composer-store",()=>({
  assertOgGenerationBudget:vi.fn(),importOgCitySource:vi.fn(),importOgSource:vi.fn(),listSavedOg:vi.fn(),readOwnedOgSource:vi.fn(),readSavedOg:vi.fn(),renderAndSaveOg:vi.fn(),storeOgSource:vi.fn(),
}));
import { mediaRequestTemplate } from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {loadCalendarWalks} from "../../../../nostr/calendar-records";
import {querySponsorCatalogue,sponsorCatalogueEntries} from "../../../../nostr/sponsor-catalogue";
import {importOgCitySource,listSavedOg} from "../../../../server/og-composer-store";
import { POST } from "./route";

describe("super-admin OG image API", () => {
  const adminKey=generateSecretKey(),actor=getPublicKey(adminKey),cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f",revisionId="a".repeat(64),approvalId="b".repeat(64),heroImageUrl="https://bitcoinwalk.org/api/media/files/"+"c".repeat(64)+".webp",
    walk={revision:{event:{id:revisionId},city:{cityId,cityName:"Madeira",slug:"madeira",heroImageUrl}},approval:{event:{id:approvalId},approval:{status:"approved",cityId,cityRevisionId:revisionId}}};
  const call = (body: unknown) =>
    POST(
      new Request("https://app-staging.bitcoinwalk.org/api/admin/og-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const signed=(request:Parameters<typeof mediaRequestTemplate>[0])=>({event:finalizeEvent(mediaRequestTemplate(request),adminKey)});
  beforeEach(()=>{
    vi.resetAllMocks();
    vi.mocked(isSuperAdmin).mockImplementation(pubkey=>pubkey===actor);
    vi.mocked(querySponsorCatalogue).mockResolvedValue([]);
    vi.mocked(sponsorCatalogueEntries).mockReturnValue([]);
    vi.mocked(listSavedOg).mockResolvedValue([]);
    vi.mocked(loadCalendarWalks).mockResolvedValue([walk] as never);
  });
  it("rejects unsigned requests", async () => {
    const response = await call({});
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Signed super-admin authorization required.",
    });
  });
  it("rejects a valid request signed by a non-admin identity", async () => {
    const event = finalizeEvent(
        mediaRequestTemplate({ action: "og-studio-list" }),
        generateSecretKey(),
      ),
      response = await call({ event });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Signed super-admin authorization required.",
    });
  });
  it("lists only the current approved city presentation image",async()=>{
    const response=await call(signed({action:"og-studio-list"}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({cityPhotosAvailable:true,cities:[{cityId,cityName:"Madeira",revisionId,approvalId,heroImageUrl}]});
  });
  it("keeps the existing studio available when the optional city library is offline",async()=>{
    vi.mocked(loadCalendarWalks).mockRejectedValue(new Error("relay offline"));
    const response=await call(signed({action:"og-studio-list"}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({cityPhotosAvailable:false,cities:[],items:[],entries:[]});
  });
  it("snapshots the exact selected city approval into the private OG source",async()=>{
    vi.mocked(importOgCitySource).mockResolvedValue({hash:"d".repeat(64),dataUrl:"data:image/webp;base64,AA==",source:"city",sourceUrl:heroImageUrl,cityId,cityName:"Madeira",revisionId,approvalId});
    const response=await call(signed({action:"og-studio-city-background",cityId,revisionId,approvalId}));
    expect(response.status).toBe(200);
    expect(importOgCitySource).toHaveBeenCalledWith(heroImageUrl,actor,{cityId,cityName:"Madeira",revisionId,approvalId});
  });
  it("refuses a stale city-photo selection after the approval changes",async()=>{
    const response=await call(signed({action:"og-studio-city-background",cityId,revisionId,approvalId:"e".repeat(64)}));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({error:expect.stringContaining("approved image changed")});
    expect(importOgCitySource).not.toHaveBeenCalled();
  });
});
