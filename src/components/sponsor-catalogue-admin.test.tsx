import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const admin=readFileSync("src/components/sponsor-catalogue-admin.tsx","utf8");
const review=readFileSync("src/components/sponsor-catalogue-review.tsx","utf8");

describe("sponsor catalogue administration",()=>{
 it("keeps manual intake pending until sponsor claim and exact artwork approval",()=>{expect(admin).toContain('recordType:"intake"');expect(admin).toContain('status:"pending"');expect(admin).toContain("It is not reusable until the sponsor claims the profile and exact artwork is approved.");expect(review).toContain("Sponsor claim required");});
 it("merges an intake and legacy assignment into one sponsor card with two explicit paths",()=>{expect(admin).toContain("candidateRows.find(row=>row.pubkey===pubkey)");expect(admin).toContain("candidateRows.filter(candidate=>!pending.includes(candidate.pubkey))");expect(admin).toContain("Use existing approved artwork");expect(admin).toContain("Review new artwork, or reuse the artwork already approved");});
 it("separates private upload, exact-hash review and signed approval",()=>{expect(review).toContain('action:"upload-sponsor-catalogue-logo"');expect(review).toContain('action:"review-sponsor-logo"');expect(review).toContain('recordType:"approval"');expect(review).toContain("Artwork integrity check failed.");});
 it("fails closed on account or stale-state changes and preserves assignments",()=>{expect(review).toContain("exactActor(dashboard.pubkey)");expect(review).toContain("Sponsor claim changed. Reload before approving artwork.");expect(review).toContain("Catalogue approval changed. Reload before approving artwork.");expect(review).toContain("Existing sponsorship assignments were not changed.");});
});
