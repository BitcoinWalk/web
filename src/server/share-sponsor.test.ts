import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../nostr/feature-flags",()=>({resolvedFeatureFlags:vi.fn()}));
vi.mock("../nostr/sponsorships",()=>({querySponsorships:vi.fn()}));
vi.mock("./public-sponsorship",()=>({publicSponsorship:vi.fn()}));
vi.mock("../lib/server-relay-config",()=>({serverReadRelays:()=>[]}));
vi.mock("./sponsor-logo-store",()=>({readSponsorLogoAsset:vi.fn()}));
import {resolvedFeatureFlags} from "../nostr/feature-flags";
import {publicSponsorship} from "./public-sponsorship";
import {querySponsorships} from "../nostr/sponsorships";
import {readSponsorLogoAsset} from "./sponsor-logo-store";
import {shareSponsor} from "./share-sponsor";
beforeEach(()=>{vi.resetAllMocks();vi.mocked(resolvedFeatureFlags).mockResolvedValue({sponsorships:true} as never);});
describe("approved share artwork",()=>{
 it("requests OG-specific expiry rather than the module end time",async()=>{
  vi.mocked(querySponsorships).mockResolvedValue([]);vi.mocked(publicSponsorship).mockReturnValue({state:"hidden"});
  await shareSponsor("city",{id:"walk"} as never);
  expect(publicSponsorship).toHaveBeenCalledWith([],true,"city",{id:"walk"},undefined,"og");
 });
 it("uses signed OG approval independently of module visibility",async()=>{vi.mocked(resolvedFeatureFlags).mockResolvedValue({sponsorships:false} as never);vi.mocked(publicSponsorship).mockReturnValue({state:"sponsor",pubkey:"a".repeat(64),logoHash:"b".repeat(64)});vi.mocked(readSponsorLogoAsset).mockResolvedValue(Buffer.from("png"));expect(await shareSponsor("city")).toEqual(Buffer.from("png"));expect(resolvedFeatureFlags).not.toHaveBeenCalled();});
 it("does not use an unapproved sponsor avatar or pending file",async()=>{vi.mocked(publicSponsorship).mockReturnValue({state:"sponsor",pubkey:"a".repeat(64)});expect(await shareSponsor("city")).toBeNull();expect(readSponsorLogoAsset).not.toHaveBeenCalled();});
 it("reads only the hash selected by signed assignment resolution",async()=>{vi.mocked(publicSponsorship).mockReturnValue({state:"sponsor",pubkey:"a".repeat(64),logoHash:"b".repeat(64)});vi.mocked(readSponsorLogoAsset).mockResolvedValue(Buffer.from("png"));expect(await shareSponsor("city",{id:"walk"} as never)).toEqual(Buffer.from("png"));expect(readSponsorLogoAsset).toHaveBeenCalledWith("b".repeat(64));});
 it("omits sponsorship if resolution fails",async()=>{vi.mocked(querySponsorships).mockRejectedValue(new Error("offline"));expect(await shareSponsor("city")).toBeNull();});
 it.each(["hidden","empty"] as const)("omits artwork for %s assignments",async state=>{vi.mocked(publicSponsorship).mockReturnValue({state});expect(await shareSponsor("city")).toBeNull();expect(readSponsorLogoAsset).not.toHaveBeenCalled();});
});
