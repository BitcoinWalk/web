import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=()=>readFileSync("src/app/organizer/_screen.tsx","utf8");

describe("my cities inventory",()=>{
 it("shows direct status groups without a redundant city finder",()=>{
  const page=source();
  for(const label of ['label:"Pending"','label:"Awaits change"'])expect(page).toContain(label);
  expect(page).toContain('const activeCities=cities.filter(item=>item.status==="editable"||item.status==="approved")');
  expect(page).toContain('className={styles.cityRail}');
  expect(page).toContain('className={styles.cityGroup}');
  expect(page).not.toContain('{key:"active",label:"Active"');
  expect(page).toContain(".filter(group=>group.items.length)");
  expect(page).toContain('const archivedCities=cities.filter(item=>item.status==="archived")');
  expect(page).toContain('<details className={styles.archive}>');
  expect(page.indexOf('className={styles.archive}')).toBeGreaterThan(page.indexOf("cityGroups.map"));
  expect(page).not.toContain("<CityFinder");
  expect(page).not.toContain("Search your cities");
 });
 it("places city-profile guidance inside the editable city panel",()=>{
  const page=source(),panel=page.indexOf('className={styles.profilePanel}'),heading=page.indexOf('selectedCity.correctable?"City correction":"City profile"');
  expect(panel).toBeGreaterThan(-1);
  expect(heading).toBeGreaterThan(panel);
  expect(page.indexOf("Edit the description, hero image and default meeting point shown across your city and walks.")).toBeGreaterThan(panel);
 });
 it("lets the organizer upload an accepted city hero or keep using a URL",()=>{const page=source();expect(page).toContain("uploadCityImage");expect(page).toContain('<ImageUploadButton label="Upload hero image"');expect(page).toContain("onSelect={file=>void uploadHero(file)}");expect(page).toContain("JPEG, PNG or WebP up to 5 MB");expect(page).toContain("Landscape image URL");});
 it("shows reviewer feedback and the exact resubmission action for correctable rejected requests",()=>{
  const page=source();
  expect(page).toContain("Correct and resubmit {base.city.cityName}");
  expect(page).toContain('className={styles.eyebrow}>Reviewer feedback');
  expect(page).toContain('selectedCity.correctable?"Submit correction":"Submit for approval"');
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
  expect(page).toContain('hidden={workspaceTab!=="pro"}');
  expect(page).toContain('<ProCitySetup enabled cityId={base.city.cityId} active={workspaceTab==="pro"} onClose={()=>setWorkspaceTab("profile")}/>');
  expect(page).not.toContain("Complete Pro setup");
  expect(page).not.toContain("/admin/upgrade");
 });
 it("lets a paid host continue private Pro setup while public city review is pending",()=>{
  const page=source();
  expect(page).toContain('workspaceTab==="profile"');
  expect(page).toContain('selectedCity.status==="awaiting-approval"');
  expect(page).toContain('onClick={()=>setWorkspaceTab("pro")}>Continue Pro setup</button>');
  expect(page).toContain("Its public profile cannot be changed while that review is pending.");
 });
 it("shows super-admin Pro identity health without opening owner-only setup",()=>{const page=source();expect(page).toContain('dashboard.role==="super-admin"?<CityIdentityHealthDetails');expect(page).toContain('identityHealth.find(row=>row.cityId===base.city.cityId)');});
 it("uses a focused workspace with separate profile and Pro service views",()=>{const page=source();expect(page).toContain('type WorkspaceTab="profile"|"pro"');expect(page).toContain('aria-label="City settings"');expect(page).toContain('>Profile</button>');expect(page).toContain('>Pro services</button>');expect(page).toContain('active={workspaceTab==="pro"}');expect(page).toContain('Alternative names and technical details');});
});
