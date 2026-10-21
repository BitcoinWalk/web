import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=()=>readFileSync("src/components/city-moderation.tsx","utf8");

describe("awaits-change cleanup",()=>{
 it("requires payment inventory and signed per-city archive read-back",()=>{
  const page=source();
  expect(page).toContain("Archive eligible Awaits change test cities");
  expect(page).toContain("if(!paymentInventoryReady)");
  expect(page).toContain("paidCityIds.has(row.revision.city.cityId)");
  expect(page).toContain("createNeedsChangesArchiveDecision(latest)");
  expect(page).toContain("archivedCityIds(readback.approvals).has(row.revision.city.cityId)");
 });
 it("shows the silent Active override directly on each Awaits change city",()=>{
  const page=source();expect(page).toContain("createSilentActiveOverrideDecision(latest)");expect(page).toContain(">Set Active as-is</button>");expect(page).toContain("No organizer notification or setup operation was created.");expect(page).toContain('item.source==="awaits-change"');
 });
});

describe("city backlog controls",()=>{
 it("uses the filter as the single city finder and exposes copyable city identifiers",()=>{
  const page=source();
 expect(page).not.toContain('label="Jump to city"');
  expect(page).toContain('placeholder="Name, slug or city ID"');
  expect(page).toContain("All city types");
  expect(page).toContain("Pro · managed relay");
  expect(page).toContain("Pro · own relay");
  expect(page).not.toContain("All statuses");
  expect(page).toContain("<CopyValue");
  expect(page).toContain("city ID`}");
 });
 it("gates permanent deletion behind offline state and typed confirmation without a provider dependency",()=>{
  const page=source();
  expect(page).toContain("Delete permanently");
  expect(page).toContain("if(latest.state===\"approved\")");
  expect(page).not.toContain('if(!paymentInventoryReady)throw new Error("Payment inventory is unavailable. Refresh cities before deleting anything.")');
  expect(page).toContain("Payment records and any provisioned relay, NIP-05, Lightning, chat or other services remain");
 expect(page).toContain("const confirmation=`DELETE ${city.slug}`");
  expect(page).toContain("deletedCityIds(readback.approvals).has(city.cityId)");
  expect(page.indexOf("if(window.prompt(warning)!==confirmation)")).toBeLessThan(page.indexOf("await run(async()=>",page.indexOf("async function deleteOfflineCity")));
 });
 it("uses one reversible lifecycle hierarchy for every managed city",()=>{
  const page=source();
  expect(page).toContain("Set offline");
  expect(page).toContain("Restore online");
  expect(page).toContain("Archive request");
  expect(page).not.toContain("Delete — archive free city");
  expect(page).not.toContain("Delete paid relay — unavailable");
  expect(page).not.toContain("Retire staging test city");
  expect(page).not.toContain("Approve / Restore");
 });
 it("keeps signed URL controls reachable",()=>{
  const page=source();
  expect(page).toContain(">Manage URL and services</button>");
  expect(page).toContain("setSelectedId(item.cityId);void run(()=>reload(item.cityId))");
  expect(page).toContain("Sign and save public URL");
 });
 it("opens a signed city editor with hero and current OG previews",()=>{
  const page=source();
  expect(page).toContain(">Edit city</button>");
  expect(page).toContain("setEditCityName(city.cityName)");
  expect(page).toContain("cityName:editCityName.trim()");
  expect(page).toContain("City name<input required maxLength={100}");
  expect(page).not.toContain(">Open city</button>");
 expect(page).toContain("hero image URL");
 expect(page).toContain("Upload hero image");
 expect(page).toContain("uploadCityImage");
  expect(page).toContain("Current OG assets");
  expect(page).toContain('fetch("/api/cities"');
  expect(page).toContain('fetch("/api/events"');
  expect(page).toContain("createCityUpdateEvent(candidate,latest.revision.event.id)");
  expect(page).toContain("Open Requests to review the new hero and sign the separate approval");
 });
 it("keeps directory lifecycle actions available when optional service checks fail",()=>{
  const page=source();
  expect(page).toContain("setDirectoryCurrent(true);setDashboardAuthorizationScope(authorizationScope,true)");
  expect(page).toContain("disabled={busy||!directoryCurrent}");
  expect(page).toContain("city status and deletion actions remain available");
  expect(page).toContain('void signPayment({action:"list"},pubkey).then(paymentFetch)');
  expect(page.indexOf("setDirectoryCurrent(true)")).toBeLessThan(page.indexOf('void signPayment({action:"list"},pubkey)'));
 });
 it("excludes signed deletions from retained service inventory rows",()=>{
  const page=source();
  expect(page).toContain("deleted:deletedCityIds(directory.approvals)");
  expect(page).toContain("setDeletedIds(snapshot.deleted)");
  expect(page).toContain("excludedCityIds:deletedIds");
 });
 it("keeps the city editor modal dismissible and prevents background scrolling",()=>{
  const page=source();
  expect(page).toContain('event.key==="Escape"');
  expect(page).toContain('document.body.style.overflow="hidden"');
  expect(page).toContain('role="dialog"');
  expect(page).toContain('aria-modal="true"');
 });
});
