import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { createCityUpdateEvent, createApprovalEvent } from "./city-event";
import { parseCityRevision, pendingCityRevisions, resolveApprovedCity, type ApprovalRecord } from "./city-records";

const key = generateSecretKey();
const cityId = "66f137cb-2ac1-4eef-8358-7dd66b45922f";
const city = { cityId, slug: "radom", cityName: "Radom", startAt: "2026-10-03T10:00:00Z", description: "Approved walk", meetingPoint: {description:"Square",latitude:1,longitude:2}, heroImageUrl:"https://example.com/hero.jpg" };
const first = parseCityRevision(finalizeEvent(createCityUpdateEvent(city), key))!;
const edit = parseCityRevision(finalizeEvent(createCityUpdateEvent({...city,description:"Pending edit"},first.event.id), key))!;
// Resolver consumes parsed records. Admin authority is tested separately.
const decision = (status: "approved" | "rejected" | "revoked", time: number, revision = first): ApprovalRecord => ({event: {id: String(time).padStart(64,"0"),created_at:time} as ApprovalRecord["event"],approval:{cityId,cityRevisionId:revision.event.id,status}});

describe("retained approved revisions", () => {
 it("gives edits and decisions separate addresses, even within the same second", () => {
  expect(first.event.tags[0]).not.toEqual(edit.event.tags[0]);
  const data = decision("approved",1).approval;
  expect(createApprovalEvent(data).tags[0]).not.toEqual(createApprovalEvent(data).tags[0]);
 });
 it("keeps the old content while an edit awaits approval", () => {
  expect(resolveApprovedCity([edit,first],[decision("approved",1)],"radom")).toBe(first);
  expect(pendingCityRevisions([edit,first],[decision("approved",1)])).toEqual([edit]);
 });
 it("rejects a pending edit without unpublishing the approved walk", () => {
  expect(resolveApprovedCity([edit,first],[decision("approved",1),decision("rejected",2,edit)],"radom")).toBe(first);
 });
 it("switches content only on explicit approval", () => {
  expect(resolveApprovedCity([edit,first],[decision("approved",1),decision("approved",2,edit)],"radom")).toBe(edit);
 });
 it("does not fall back if the selected revision is missing", () => {
  expect(resolveApprovedCity([first],[decision("approved",1),decision("approved",2,edit)],"radom")).toBeNull();
 });
 it("revokes city-wide and requires a later approval to republish", () => {
  const records=[decision("approved",1),decision("revoked",2),decision("rejected",3,edit)];
  expect(resolveApprovedCity([edit,first],records,"radom")).toBeNull();
  expect(resolveApprovedCity([edit,first],[...records,decision("approved",4,edit)],"radom")).toBe(edit);
 });
 it("reads legacy revisions, but rejects cross-city addresses", () => {
  const template=createCityUpdateEvent(city);
  template.tags[0]=["d",cityId];
  expect(parseCityRevision(finalizeEvent(template,key))).not.toBeNull();
  template.tags[0]=["d",`77f137cb-2ac1-4eef-8358-7dd66b45922f:${crypto.randomUUID()}`];
  expect(parseCityRevision(finalizeEvent(template,key))).toBeNull();
 });
});
