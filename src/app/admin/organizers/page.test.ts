import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import OrganizersPage,{organizerTabFromLocation} from "./page";

describe("Organizers module",()=>{
 it("groups editor permissions and invitations",()=>{const html=renderToStaticMarkup(createElement(OrganizersPage));expect(html).toContain("City editors");expect(html).toContain("Invite organizers");expect(html).not.toContain("Walk moderation");});
 it("selects only known organizer views",()=>{expect(organizerTabFromLocation("?tab=invitations")).toBe("invitations");expect(organizerTabFromLocation("?tab=other")).toBe("editors");});
});
