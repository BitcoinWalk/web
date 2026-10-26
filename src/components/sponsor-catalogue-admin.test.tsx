import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const admin=readFileSync("src/components/sponsor-catalogue-admin.tsx","utf8");
const review=readFileSync("src/components/sponsor-catalogue-review.tsx","utf8");

describe("sponsor catalogue administration",()=>{
 it("keeps manual intake pending until sponsor claim and exact artwork approval",()=>{expect(admin).toContain('recordType:"intake"');expect(admin).toContain('status:"pending"');expect(admin).toContain("It is not reusable until the sponsor claims the profile and exact artwork is approved.");expect(review).toContain("Sponsor claim required");});
 it("separates private upload, exact-hash review and signed approval",()=>{expect(review).toContain('action:"upload-sponsor-catalogue-logo"');expect(review).toContain('action:"review-sponsor-logo"');expect(review).toContain('recordType:"approval"');expect(review).toContain("Artwork integrity check failed.");});
 it("fails closed when the current claim or approval changes and preserves assignments",()=>{expect(review).toContain("Sponsor claim changed. Reload before approving artwork.");expect(review).toContain("Catalogue approval changed. Reload before approving artwork.");expect(review).toContain("Existing sponsorship assignments were not changed.");});
});
