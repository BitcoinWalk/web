import {describe,it,expect} from "vitest";
import {dashboardNavigation,dashboardAccess,dashboardMenuLabel,legacyDashboardHref} from "./dashboard";
describe("dashboard navigation boundaries",()=>{
 it("shows only overview before connection",()=>{expect(dashboardNavigation("disconnected").map(i=>i.href)).toEqual(["/admin"]);});
 it("shows hosted walks to members without city administration",()=>{expect(dashboardAccess("/admin/walks","member")).toBe(true);expect(dashboardAccess("/admin/cities","member")).toBe(false);});
 it("lets organizers edit their walks and city templates without exposing administration or the deferred relay directory",()=>{for(const route of ["/admin/cities","/admin/organizers","/admin/directory"])expect(dashboardAccess(route,"organizer")).toBe(false);expect(dashboardAccess("/admin/my-cities","organizer")).toBe(true);expect(dashboardAccess("/admin/directory","super-admin")).toBe(false);expect(dashboardAccess("/admin/walks","organizer")).toBe(true);});
 it("combines Alerts and Relays under super-admin Monitoring",()=>{const navigation=dashboardNavigation("super-admin");expect(navigation).toHaveLength(7);expect(navigation.slice(1,5).map(item=>[item.label,item.href])).toEqual([["Cities","/admin/cities"],["Requests","/admin/requests"],["Walks","/admin/walks"],["Organizers","/admin/organizers"]]);expect(navigation.at(-1)).toMatchObject({label:"Monitoring",href:"/admin/monitoring/alerts"});for(const route of ["/admin/monitoring","/admin/monitoring/alerts","/admin/monitoring/relays","/admin/alerts"])expect(dashboardAccess(route,"super-admin")).toBe(true);expect(dashboardAccess("/admin/monitoring/relays","organizer")).toBe(false);expect(dashboardAccess("/admin/monitoring/alerts","member")).toBe(false);});
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
 it("uses role-aware menu names and fail-closed counts",()=>{
  expect(dashboardMenuLabel("/admin/cities","Cities","super-admin",{cities:12,walks:8,requests:2})).toBe("Cities (12)");
  expect(dashboardMenuLabel("/admin/walks","Walks","super-admin",{cities:12,walks:8,requests:2})).toBe("Upcoming walks (8)");
  expect(dashboardMenuLabel("/admin/walks","Walks","organizer",{cities:null,walks:3,requests:null})).toBe("My walks (3)");
  expect(dashboardMenuLabel("/admin/walks","Walks","organizer",{cities:null,walks:null,requests:null})).toBe("My walks (?)");
  expect(dashboardMenuLabel("/admin/walks","Walks","member",{cities:null,walks:null,requests:null})).toBe("Walks");
 });
});
