import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=()=>readFileSync("src/app/organizer/_screen.tsx","utf8");

describe("my cities inventory",()=>{
 it("shows direct status groups without a redundant city finder",()=>{
  const page=source();
  for(const label of ['label:"Active"','label:"Archived"','label:"Pending"','label:"Needs changes"'])expect(page).toContain(label);
  expect(page).toContain(".filter(group=>group.items.length)");
  expect(page).not.toContain("<CityFinder");
  expect(page).not.toContain("Search your cities");
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
