import {readdirSync} from "node:fs";
import {join,relative,sep} from "node:path";
import {describe,expect,it} from "vitest";
import {dashboardAccess,dashboardNavigation,type DashboardRole} from "./dashboard";

const adminRoot=join(process.cwd(),"src","app","admin");
function pageRoutes(directory=adminRoot):string[]{
 return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const path=join(directory,entry.name);
  if(entry.isDirectory())return pageRoutes(path);
  if(entry.name!=="page.tsx")return [];
  const suffix=relative(adminRoot,directory).split(sep).filter(Boolean).join("/");
  return [`/admin${suffix?`/${suffix}`:""}`];
 }).sort();
}

const routes={
 "/admin":["member","organizer","super-admin"],
 "/admin/accept-invitation":["member","organizer","super-admin"],
 "/admin/alerts":["super-admin"],
 "/admin/appearance":["member","organizer","super-admin"],
 "/admin/approvals":["member","organizer","super-admin"],
 "/admin/calendar":["member","organizer","super-admin"],
 "/admin/chat":["member","organizer","super-admin"],
 "/admin/cities":["super-admin"],
 "/admin/content":["super-admin"],
 "/admin/directory":["organizer","super-admin"],
 "/admin/editors":["member","organizer","super-admin"],
 "/admin/guide":["member","organizer","super-admin"],
 "/admin/hosting":["member","organizer","super-admin"],
 "/admin/invitations":["member","organizer","super-admin"],
 "/admin/madeira-pilot":["member","organizer","super-admin"],
 "/admin/moderation":["member","organizer","super-admin"],
 "/admin/monitoring":["member","organizer","super-admin"],
 "/admin/monitoring/alerts":["super-admin"],
 "/admin/monitoring/armada":["super-admin"],
 "/admin/monitoring/chats":["super-admin"],
 "/admin/monitoring/relays":["super-admin"],
 "/admin/my-cities":["organizer"],
 "/admin/notifications":["member","organizer","super-admin"],
 "/admin/organizers":["super-admin"],
 "/admin/pro-setup":["member","organizer","super-admin"],
 "/admin/profile":["member","organizer","super-admin"],
 "/admin/requests":["super-admin"],
 "/admin/sponsor":["member","organizer","super-admin"],
 "/admin/sponsors":["member","organizer","super-admin"],
 "/admin/sponsors/logos":["super-admin"],
 "/admin/sponsors/payments":["super-admin"],
 "/admin/sponsors/upload":["super-admin"],
 "/admin/upgrade":["member","organizer","super-admin"],
 "/admin/walks":["member","organizer","super-admin"],
} satisfies Record<string,DashboardRole[]>;

describe("complete admin route acceptance matrix",()=>{
 it("accounts for every current page instead of relying on the historical route count",()=>{
  expect(pageRoutes()).toEqual(Object.keys(routes).sort());
  expect(pageRoutes()).toHaveLength(34);
 });
 it("keeps every connected role inside its reviewed route boundary",()=>{
  for(const [path,allowed] of Object.entries(routes))for(const role of ["member","organizer","super-admin"] as const){
   expect(dashboardAccess(path,role),`${role} access to ${path}`).toBe((allowed as DashboardRole[]).includes(role));
  }
 });
 it("keeps primary navigation smaller than the complete route surface",()=>{
  expect(dashboardNavigation("member").map(item=>item.href)).toEqual(["/admin","/admin/sponsor","/admin/chat"]);
  expect(dashboardNavigation("member",{hostedWalks:true}).map(item=>item.href)).toEqual(["/admin","/admin/walks","/admin/sponsor","/admin/chat"]);
  expect(dashboardNavigation("organizer").map(item=>item.href)).toEqual(["/admin","/admin/my-cities","/admin/walks","/admin/sponsor","/admin/chat"]);
  expect(dashboardNavigation("super-admin").map(item=>item.href)).toEqual(["/admin","/admin/requests","/admin/cities","/admin/walks","/admin/sponsor","/admin/chat","/admin/organizers","/admin/content","/admin/monitoring/alerts"]);
 });
});
