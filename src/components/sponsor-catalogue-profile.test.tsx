import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=readFileSync("src/components/sponsor-catalogue-profile.tsx","utf8");
describe("sponsor catalogue profile",()=>{
 it("requires the connected sponsor identity and preserves immutable assignments on withdrawal",()=>{expect(source).toContain('actor!==dashboard.pubkey');expect(source).toContain('previousRevisionId:claim.event.id');expect(source).toContain("Existing signed sponsorship assignments were not changed.");});
 it("verifies an exact sponsor signature without requiring the super-admin",()=>{expect(source).toContain("assertExactSponsorCatalogueClaimSigned(event,template,actor)");expect(source).not.toContain("assertExactSigned(event,template)");});
 it("offers accessible claim and explicit withdrawal actions",()=>{expect(source).toContain('id="catalogue-profile-heading"');expect(source).toContain("Claim catalogue profile");expect(source).toContain("Withdraw profile");expect(source).toContain("window.confirm");});
});
