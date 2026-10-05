import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../nostr/feature-flags",()=>({resolvedFeatureFlags:vi.fn()}));
vi.mock("../nostr/sponsorships",()=>({querySponsorships:vi.fn(),resolveSponsorship:vi.fn()}));
vi.mock("../lib/server-relay-config",()=>({serverReadRelays:()=>[]}));
vi.mock("./sponsor-logo-store",()=>({readSponsorLogoAsset:vi.fn()}));
import {resolvedFeatureFlags} from "../nostr/feature-flags";
import {resolveSponsorship} from "../nostr/sponsorships";
import {readSponsorLogoAsset} from "./sponsor-logo-store";
import {shareSponsor} from "./share-sponsor";
beforeEach(()=>{vi.resetAllMocks();vi.mocked(resolvedFeatureFlags).mockResolvedValue({sponsorships:true} as never);});
describe("approved share artwork",()=>{
 it("does not read artwork when the feature is off",async()=>{vi.mocked(resolvedFeatureFlags).mockResolvedValue({sponsorships:false} as never);expect(await shareSponsor("city")).toBeNull();expect(readSponsorLogoAsset).not.toHaveBeenCalled();});
 it("does not use an unapproved sponsor avatar or pending file",async()=>{vi.mocked(resolveSponsorship).mockReturnValue({state:"sponsor",pubkey:"a".repeat(64)});expect(await shareSponsor("city")).toBeNull();expect(readSponsorLogoAsset).not.toHaveBeenCalled();});
 it("reads only the hash selected by signed assignment resolution",async()=>{vi.mocked(resolveSponsorship).mockReturnValue({state:"sponsor",pubkey:"a".repeat(64),logoHash:"b".repeat(64)});vi.mocked(readSponsorLogoAsset).mockResolvedValue(Buffer.from("png"));expect(await shareSponsor("city","walk")).toEqual(Buffer.from("png"));expect(readSponsorLogoAsset).toHaveBeenCalledWith("b".repeat(64));});
 it("omits sponsorship if resolution fails",async()=>{vi.mocked(resolvedFeatureFlags).mockRejectedValue(new Error("offline"));expect(await shareSponsor("city")).toBeNull();});
});
