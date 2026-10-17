import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("organizer room setup",()=>{
 it("creates and reconciles the exact current-owner roster from the Hosts module",()=>{const source=readFileSync("src/components/organizer-room-setup.tsx","utf8");expect(source).toContain("BitcoinWalk Organizers");expect(source).toContain("Sign and set up organizer chat");expect(source).toContain("organizerRoomRosterPlan");expect(source).toContain("removeMemberTemplate");expect(source).toContain("verifiedOrganizerRoomMetadata");expect(source).toContain("Not end-to-end encrypted");expect(source).toContain("there is no public join queue");expect(source).toContain('href="/admin/chat"');});
});
