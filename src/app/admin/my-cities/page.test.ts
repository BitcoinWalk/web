import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=()=>readFileSync("src/app/organizer/_screen.tsx","utf8");

describe("my cities inventory",()=>{
 it("shows direct status groups without a redundant city finder",()=>{
  const page=source();
  for(const label of ['label:"Pending"','label:"Awaits change"'])expect(page).toContain(label);
  expect(page).toContain('const activeCities=cities.filter(item=>item.status==="editable"||item.status==="approved")');
  expect(page).toContain('<div className="organizer-city-active"');
  expect(page).not.toContain('{key:"active",label:"Active"');
  expect(page).toContain(".filter(group=>group.items.length)");
  expect(page).toContain('const archivedCities=cities.filter(item=>item.status==="archived")');
  expect(page).toContain('<details className="organizer-city-archive">');
  expect(page.indexOf("organizer-city-archive")).toBeGreaterThan(page.indexOf("organizer-city-groups"));
  expect(page).not.toContain("<CityFinder");
  expect(page).not.toContain("Search your cities");
 });
 it("places city-profile guidance inside the editable city panel",()=>{
  const page=source(),panel=page.indexOf("{base && (selectedCity?.editable||selectedCity?.correctable) && <section>"),heading=page.indexOf('selectedCity.correctable?"City correction":"City profile"');
  expect(panel).toBeGreaterThan(-1);
  expect(heading).toBeGreaterThan(panel);
  expect(page.indexOf("Edit the city description, hero image and default meeting point.")).toBeGreaterThan(panel);
 });
 it("shows reviewer feedback and the exact resubmission action for correctable rejected requests",()=>{
  const page=source();
  expect(page).toContain("Correct and resubmit {base.city.cityName}");
  expect(page).toContain("<strong>Reviewer feedback:</strong>");
  expect(page).toContain("Submit correction for review");
  expect(page).toContain("correctableRejectedCityRevisions");
  expect(page).toContain('tag[3]==="initial-walk"');
  expect(page).toContain("createInitialCalendarProposal(candidate,zone,calendarRoute(original)");
  expect(page.indexOf("for(const walk of replacementWalks)await publishVerifiedEvent")).toBeLessThan(page.indexOf("const publication=await publishVerifiedEvent(signed"));
 });
 it("does not expose identity or legacy guidance copy",()=>{
  const page=source();
  expect(page).not.toContain("Connected public key:");
  expect(page).not.toContain("Active, pending and rejected cities appear below");
  expect(page).not.toContain("Select a city. Pending registrations are visible here");
 });
 it("loads the whole owner inventory and opens a sole city automatically",()=>{
  const page=source();
  expect(page).toContain("const available=organizerCityInventory(key,grants,revisions,approvals);");
  expect(page).toContain('new URLSearchParams(window.location.search).get("city")');
  expect(page).toContain("else if(available.length===1)select(available[0].revision)");
  expect(page).not.toContain(".filter(item=>!dashboard.selectedCity");
 });
 it("keeps every paid-city host control inside the selected city",()=>{
  const page=source();
  expect(page).toContain('import {ProCitySetup} from "../admin/pro-setup/screen"');
  expect(page).toContain('proCityIds.has(base.city.cityId)&&<ProCitySetup enabled cityId={base.city.cityId}/>');
  expect(page).not.toContain("Complete Pro setup");
  expect(page).not.toContain("/admin/upgrade");
 });
});
