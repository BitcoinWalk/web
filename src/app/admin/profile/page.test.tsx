import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import {DashboardContext,emptyDashboardSession} from "../../../components/dashboard-context";
vi.mock("next/font/local",()=>({default:()=>({className:"font"})}));
import ProfilePage,{CityProfile} from "./page";
import {dashboardAccess,dashboardNavigation} from "../../../domain/dashboard";
describe("profile entry",()=>{
 it("shows assigned addresses without presenting them as editable fields",()=>{const html=renderToStaticMarkup(createElement(CityProfile,{cityId:"d7d1cda8-7a58-42ad-ab60-c4bad61dab9a",actor:"a".repeat(64)}));expect(html).toContain("NIP-05 · verified public address");expect(html).toContain("LNURL · public Lightning address");expect(html).toContain("you do not type them manually");expect(html).not.toContain("<input");});
 it("offers automatic default-city saving without a separate save button",()=>{
  const session={...emptyDashboardSession,cities:[{id:"d7d1cda8-7a58-42ad-ab60-c4bad61dab9a",name:"Bangkok"}]};
  const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:session},createElement(ProfilePage)));
  expect(html).toContain("Your default city");expect(html).toContain("Saves automatically across devices.");
  expect(html).toContain('role="status"');expect(html).not.toContain("Save default city across devices");
 });
 it("is available to connected accounts from the account menu rather than primary navigation",()=>{expect(dashboardAccess("/admin/profile","organizer")).toBe(true);expect(dashboardAccess("/admin/profile","disconnected")).toBe(false);expect(dashboardNavigation("organizer").some(row=>String(row.href)==="/admin/profile")).toBe(false);expect(dashboardNavigation("super-admin").some(row=>String(row.href)==="/admin/profile")).toBe(false);});
 it("does not expose another city's private payout information before an owner-signed check",()=>{const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:emptyDashboardSession},createElement(ProfilePage)));expect(html).toContain("No managed cities");expect(html).not.toContain("Private organizer payout wallet");});
});
