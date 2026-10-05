import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const source=()=>readFileSync("src/app/admin/_approvals-screen.tsx","utf8");
describe("new-city approval readiness",()=>{
 it("requires and confirms the exact localized logo pack before approval",()=>{const page=source();expect(page).toContain("Create and verify all ten localized logo files");expect(page).toContain("prepareCityLogos(submission.cityId,submission.eventId,slug)");expect(page).toContain('logoStates[submission.eventId]?.status!=="ready"');expect(page).toContain("City URL changed. Create the localized logos again");});
 it("defaults the sponsor invitation on while allowing the administrator to deselect it",()=>{const page=source();expect(page).toContain("current[item.eventId]??true");expect(page).toContain('checked={inviteSponsors[submission.eventId]??true}');expect(page).toContain("Deselect it to approve the city without creating the sponsor invitation module.");});
 it("publishes an empty city sponsorship before the final approval without replacing an assigned sponsor",()=>{const page=source();expect(page).toContain('const desired=invite?"empty" as const:"hidden" as const');expect(page).toContain('mode:desired,...(existing?{previousRevisionId:existing.event.id}:{})');expect(page).toContain('["empty","hidden"].includes(existing.sponsorship.mode)');expect(page).toContain("Existing ${existing.sponsorship.mode} sponsorship setting preserved.");expect(page).toContain("Final step: sign the city decision");});
});
