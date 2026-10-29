import {describe,it,expect} from "vitest";
import {dashboardNavigation,dashboardAccess,dashboardHomeActions,dashboardHomeCopy,dashboardMenuLabel,dashboardProfileVisible,legacyDashboardHref} from "./dashboard";
it("allows the private pilot screen after login without a general menu item; its API enforces exact identity",()=>{
 expect(dashboardAccess("/admin/madeira-pilot","organizer")).toBe(true);
 expect(dashboardAccess("/admin/madeira-pilot","super-admin")).toBe(true);
 expect(dashboardAccess("/admin/madeira-pilot","disconnected")).toBe(false);
 expect(dashboardNavigation("organizer").some(item=>String(item.href)==="/admin/madeira-pilot")).toBe(false);
});
describe("dashboard navigation boundaries",()=>{
 it("keeps retired Pro setup URLs behind login while My Cities is the only organizer destination",()=>{expect(dashboardAccess("/admin/upgrade","disconnected")).toBe(false);expect(dashboardAccess("/admin/upgrade","organizer")).toBe(true);expect(dashboardAccess("/admin/pro-setup","organizer")).toBe(true);expect(dashboardAccess("/admin/my-cities","organizer")).toBe(true);expect(dashboardNavigation("organizer").some(item=>String(item.href)==="/admin/upgrade")).toBe(false);});
 it("shows only overview before connection",()=>{expect(dashboardNavigation("disconnected").map(i=>i.href)).toEqual(["/admin"]);});
 it("shows hosted walks to members without presenting an empty management destination",()=>{expect(dashboardAccess("/admin/walks","member")).toBe(true);expect(dashboardAccess("/admin/cities","member")).toBe(false);expect(dashboardNavigation("member").some(item=>item.href==="/admin/walks")).toBe(false);expect(dashboardNavigation("member",{hostedWalks:true})).toContainEqual(expect.objectContaining({href:"/admin/walks"}));});
 it("shows the city chat to every connected identity",()=>{for(const role of ["member","organizer","super-admin"] as const){expect(dashboardAccess("/admin/chat",role)).toBe(true);expect(dashboardNavigation(role)).toContainEqual(expect.objectContaining({href:"/admin/chat",label:"Chat"}));}expect(dashboardAccess("/admin/chat","disconnected")).toBe(false);});
 it("shows notification controls to every connected identity",()=>{for(const role of ["member","organizer","super-admin"] as const){expect(dashboardAccess("/admin/notifications",role)).toBe(true);expect(dashboardNavigation(role)).toContainEqual(expect.objectContaining({href:"/admin/notifications",label:"Notifications"}));}expect(dashboardAccess("/admin/notifications","disconnected")).toBe(false);});
 it("keeps Guide inside Chat instead of duplicating it in navigation",()=>{for(const role of ["member","organizer","super-admin"] as const){expect(dashboardNavigation(role).some(item=>String(item.href)==="/admin/guide")).toBe(false);expect(dashboardAccess("/admin/guide",role)).toBe(true);}expect(legacyDashboardHref("/admin/guide")).toBe("/admin/chat?room=guide");});
 it("keeps the full profile panel on Overview only",()=>{expect(dashboardProfileVisible("/admin")).toBe(true);for(const path of ["/admin/chat","/admin/walks","/admin/sponsor"])expect(dashboardProfileVisible(path)).toBe(false);});
 it("makes identity-scoped sponsorships discoverable without exposing nested administration",()=>{for(const role of ["member","organizer"] as const){for(const path of ["/admin/sponsor","/admin/sponsors"])expect(dashboardAccess(path,role)).toBe(true);expect(dashboardNavigation(role)).toContainEqual(expect.objectContaining({href:"/admin/sponsor",label:"Sponsorships"}));expect(dashboardAccess("/admin/sponsors/payments",role)).toBe(false);}expect(dashboardAccess("/admin/sponsor","disconnected")).toBe(false);});
 it("lets organizers edit walks and review owner-bound relay requests without exposing administration",()=>{for(const route of ["/admin/cities","/admin/organizers"])expect(dashboardAccess(route,"organizer")).toBe(false);expect(dashboardAccess("/admin/my-cities","organizer")).toBe(true);expect(dashboardAccess("/admin/directory","organizer")).toBe(true);expect(dashboardAccess("/admin/directory","super-admin")).toBe(true);expect(dashboardAccess("/admin/directory","member")).toBe(false);expect(dashboardAccess("/admin/walks","organizer")).toBe(true);});
 it("combines Alerts and Relays under super-admin Monitoring",()=>{const navigation=dashboardNavigation("super-admin");expect(navigation).toHaveLength(11);expect(navigation.slice(1,8).map(item=>[item.label,item.href])).toEqual([["Cities","/admin/cities"],["Requests","/admin/requests"],["Walks","/admin/walks"],["Sponsorships","/admin/sponsor"],["Chat","/admin/chat"],["Notifications","/admin/notifications"],["Hosts","/admin/organizers"]]);expect(navigation).toContainEqual(expect.objectContaining({label:"Sponsorships",href:"/admin/sponsor"}));expect(navigation).toContainEqual(expect.objectContaining({label:"City relay setup",href:"/admin/directory"}));expect(navigation.at(-1)).toMatchObject({label:"Monitoring",href:"/admin/monitoring/alerts"});for(const route of ["/admin/monitoring","/admin/monitoring/alerts","/admin/monitoring/relays","/admin/alerts"])expect(dashboardAccess(route,"super-admin")).toBe(true);expect(dashboardAccess("/admin/monitoring/relays","organizer")).toBe(false);expect(dashboardAccess("/admin/monitoring/alerts","member")).toBe(false);});
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
  expect(dashboardMenuLabel("/admin/walks","Walks","member",{cities:null,walks:null,requests:null})).toBe("Walks I host (?)");
  expect(dashboardMenuLabel("/admin/walks","Walks","member",{cities:null,walks:2,requests:null})).toBe("Walks I host (2)");
  expect(dashboardMenuLabel("/admin/sponsor","Sponsorships","super-admin",{cities:null,walks:null,requests:null})).toBe("Sponsors");
 });
 it("provides focused home actions for each audience without changing access",()=>{
  expect(dashboardHomeCopy("member").title).toBe("Welcome to BitcoinWalk");
  expect(dashboardHomeActions("member").map(item=>item.label)).toEqual(["Find a walk","Open chat","Sponsorships","Start a BitcoinWalk"]);
  expect(dashboardHomeActions("member",{hostedWalks:true})[0].label).toBe("Walks you host");
  expect(dashboardHomeActions("organizer").map(item=>item.href)).toContain("/admin/my-cities");
  expect(dashboardHomeActions("super-admin").map(item=>item.href)).toEqual(["/admin/requests","/admin/cities","/admin/walks","/admin/sponsor"]);
 });
});
