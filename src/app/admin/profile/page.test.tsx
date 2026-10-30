import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import {DashboardContext,emptyDashboardSession} from "../../../components/dashboard-context";
vi.mock("next/font/local",()=>({default:()=>({className:"font"})}));
import ProfilePage,{CityProfile} from "./page";
import {dashboardNavigation} from "../../../domain/dashboard";
describe("profile entry",()=>{
 it("shows both address fields before asking for a private status signature",()=>{const html=renderToStaticMarkup(createElement(CityProfile,{cityId:"d7d1cda8-7a58-42ad-ab60-c4bad61dab9a",actor:"a".repeat(64)}));expect(html).toContain("NIP-05 · verified public address");expect(html).toContain("LNURL · public Lightning address");expect(html.match(/readonly=""/gi)).toHaveLength(2);});
 it("offers automatic default-city saving without a separate save button",()=>{
  const session={...emptyDashboardSession,cities:[{id:"d7d1cda8-7a58-42ad-ab60-c4bad61dab9a",name:"Bangkok"}]};
  const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:session},createElement(ProfilePage)));
  expect(html).toContain("Your default city");expect(html).toContain("Saves automatically across devices.");
  expect(html).toContain('role="status"');expect(html).not.toContain("Save default city across devices");
 });
 it("is discoverable to connected accounts only",()=>{expect(dashboardNavigation("organizer").some(row=>row.href==="/admin/profile")).toBe(true);expect(dashboardNavigation("disconnected").some(row=>row.href==="/admin/profile")).toBe(false);});
 it("does not expose another city's private payout information before an owner-signed check",()=>{const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:emptyDashboardSession},createElement(ProfilePage)));expect(html).toContain("No managed cities");expect(html).not.toContain("Private organizer payout wallet");});
});
