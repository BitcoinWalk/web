import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import OrganizersPage,{organizerTabFromLocation} from "./page";

describe("Organizers module",()=>{
 it("groups the host directory, permissions, invitations and publishing access",()=>{const html=renderToStaticMarkup(createElement(OrganizersPage));expect(html).toContain("All hosts");expect(html).toContain("Host directory");expect(html).toContain("City editors");expect(html).toContain("Invite hosts");expect(html).toContain("Publishing access");expect(html).not.toContain("Walk moderation");});
 it("selects only known organizer views",()=>{expect(organizerTabFromLocation("?tab=editors")).toBe("editors");expect(organizerTabFromLocation("?tab=invitations")).toBe("invitations");expect(organizerTabFromLocation("?tab=publishing")).toBe("publishing");expect(organizerTabFromLocation("?tab=other")).toBe("directory");});
});
