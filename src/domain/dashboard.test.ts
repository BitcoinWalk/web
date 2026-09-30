import {describe,it,expect} from "vitest";
import {dashboardNavigation,dashboardAccess,legacyDashboardHref} from "./dashboard";
describe("dashboard navigation boundaries",()=>{
 it("shows only overview before connection",()=>{expect(dashboardNavigation("disconnected").map(i=>i.href)).toEqual(["/admin"]);});
 it("shows hosted walks to members without city administration",()=>{expect(dashboardAccess("/admin/walks","member")).toBe(true);expect(dashboardAccess("/admin/cities","member")).toBe(false);});
 it("lets organizers edit their walks, city templates and relay directory without exposing city or organizer administration",()=>{for(const route of ["/admin/cities","/admin/organizers"])expect(dashboardAccess(route,"organizer")).toBe(false);expect(dashboardAccess("/admin/my-cities","organizer")).toBe(true);expect(dashboardAccess("/admin/directory","organizer")).toBe(true);expect(dashboardAccess("/admin/directory","super-admin")).toBe(false);expect(dashboardAccess("/admin/walks","organizer")).toBe(true);});
 it("gives the super-admin separate Cities, Requests, Walks and Organizers modules",()=>{const navigation=dashboardNavigation("super-admin");expect(navigation).toHaveLength(7);expect(navigation.slice(1,5).map(item=>[item.label,item.href])).toEqual([["Cities","/admin/cities"],["Requests","/admin/requests"],["Walks","/admin/walks"],["Organizers","/admin/organizers"]]);expect(dashboardAccess("/admin/alerts","super-admin")).toBe(true);expect(dashboardAccess("/admin/content","super-admin")).toBe(true);expect(dashboardAccess("/admin/content","organizer")).toBe(false);});
 it("keeps the retired photo URL reachable for redirect middleware",()=>{expect(dashboardAccess("/admin/appearance","organizer")).toBe(true);});
 it("preserves invite parameters and sends legacy organizer pages to Walks",()=>{expect(legacyDashboardHref("/organizer/invitations","?invite=abc","#details")).toBe("/admin/accept-invitation?invite=abc#details");expect(legacyDashboardHref("/organizer")).toBe("/admin/walks");expect(legacyDashboardHref("/admin/calendar")).toBe("/admin/walks");expect(()=>legacyDashboardHref("https://evil.example")).toThrow();});
 it("routes old tools into their new focused modules",()=>{
  const id="a".repeat(64);
  expect(legacyDashboardHref("/admin/approvals","",`#submission-${id}`)).toBe(`/admin/requests#submission-${id}`);
  expect(legacyDashboardHref("/admin/editors","?city=memphis")).toBe("/admin/organizers?tab=editors&city=memphis");
  expect(legacyDashboardHref("/admin/invitations")).toBe("/admin/organizers?tab=invitations");
  expect(legacyDashboardHref("/admin/moderation")).toBe("/admin/walks?tab=moderation");
  expect(dashboardAccess("/admin/approvals","organizer")).toBe(true);
 });
 it("allows a nominee to review an invitation without admin permission",()=>{expect(dashboardAccess("/admin/accept-invitation","disconnected")).toBe(true);});
});
