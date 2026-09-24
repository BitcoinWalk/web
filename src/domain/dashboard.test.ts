import {describe,it,expect} from "vitest";
import {dashboardNavigation,dashboardAccess,legacyDashboardHref} from "./dashboard";
describe("dashboard navigation boundaries",()=>{
 it("shows only overview before connection",()=>{expect(dashboardNavigation("disconnected").map(i=>i.href)).toEqual(["/admin"]);});
 it("shows hosted walks to members without city permissions",()=>{expect(dashboardAccess("/admin/walks","member")).toBe(true);expect(dashboardAccess("/admin/cities","member")).toBe(false);});
 it("restricts consolidated city controls from organizers",()=>{for(const route of ["/admin/cities","/admin/invitations"])expect(dashboardAccess(route,"organizer")).toBe(false);expect(dashboardAccess("/admin/walks","organizer")).toBe(true);});
 it("lets the super-admin navigate all remaining sections",()=>{expect(dashboardNavigation("super-admin")).toHaveLength(4);});
 it("preserves invite parameters and sends legacy organizer pages to Walks",()=>{expect(legacyDashboardHref("/organizer/invitations","?invite=abc","#details")).toBe("/admin/accept-invitation?invite=abc#details");expect(legacyDashboardHref("/organizer")).toBe("/admin/walks");expect(legacyDashboardHref("/admin/calendar")).toBe("/admin/walks");expect(()=>legacyDashboardHref("https://evil.example")).toThrow();});
 it("routes old city tools and approval anchors into the unified Cities section",()=>{
  const id="a".repeat(64);
  expect(legacyDashboardHref("/admin/approvals","",`#submission-${id}`)).toBe(`/admin/cities?tab=requests#submission-${id}`);
  expect(legacyDashboardHref("/admin/editors","?city=memphis")).toBe("/admin/cities?tab=editors&city=memphis");
  expect(legacyDashboardHref("/admin/moderation")).toBe("/admin/cities?tab=manage");
  expect(dashboardAccess("/admin/approvals","organizer")).toBe(true);
 });
 it("allows a nominee to review an invitation without admin permission",()=>{expect(dashboardAccess("/admin/accept-invitation","disconnected")).toBe(true);});
});
