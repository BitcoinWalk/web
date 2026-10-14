import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=()=>readFileSync("src/app/organizer/_screen.tsx","utf8");

describe("my cities inventory",()=>{
 it("shows direct status groups without a redundant city finder",()=>{
  const page=source();
  for(const label of ['label:"Pending"','label:"Needs changes"'])expect(page).toContain(label);
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
  const page=source(),panel=page.indexOf("{base && selectedCity&&(selectedCity.editable||selectedCity.correction) && <section>"),heading=page.indexOf("<h2>City profile</h2>");
  expect(panel).toBeGreaterThan(-1);
  expect(heading).toBeGreaterThan(panel);
  expect(page.indexOf("Edit the city description, hero image and default meeting point.")).toBeGreaterThan(panel);
 });
 it("offers rejected creators an exact correction action while keeping pending cities read-only",()=>{
  const page=source();
  expect(page).toContain("Reviewer feedback:");
  expect(page).toContain("Resubmit corrections for review");
  expect(page).toContain("cannot be changed while that decision is pending");
  expect(page).toContain("createInitialCalendarProposal(candidate,timeZone");
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
  expect(page).toContain("else if(available.length===1)select(available[0].revision)");
  expect(page).not.toContain(".filter(item=>!dashboard.selectedCity");
 });
});
