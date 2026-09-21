import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import { createAuthorizationEvent } from "./city-event";
import { parseAuthorizationRecord, resolveApprovedCity, type CityRevision, type ApprovalRecord } from "./city-records";
import { SUPER_ADMIN_PUBKEY } from "./authority";

const cityId = "66f137cb-2ac1-4eef-8358-7dd66b45922f";
const revision = { event: { id: "a".repeat(64), created_at: 1 }, city: {cityId, slug: "pilot"} } as CityRevision;
const decision = (status: "approved"|"revoked"|"rejected", time: number, id=cityId): ApprovalRecord => ({event: {created_at:time,id:String(time).padStart(64,"0")} as ApprovalRecord["event"],approval:{cityId:id,cityRevisionId:revision.event.id,status}});
describe("staging organizer integration",()=>{
 it("does not resurrect approval after revocation or rejection",()=>{
  for(const status of ["revoked","rejected"] as const) expect(resolveApprovedCity([revision],[decision("approved",1),decision(status,2)],"pilot")).toBeNull();
 });
 it("requires city identity as well as revision ID",()=>{
  expect(resolveApprovedCity([revision],[decision("approved",1,"another-city")],"pilot")).toBeNull();
 });
 it("resolves newest decisions regardless of input order",()=>{
  expect(resolveApprovedCity([revision],[decision("approved",3),decision("revoked",2)],"pilot")).toBe(revision);
 });
 it("builds a creator grant and refuses to drop the creator",()=>{
  const key=generateSecretKey(),creator=getPublicKey(key);
  const grant={cityId,creatorPubkey:creator,creatorRevisionId:revision.event.id,editorPubkeys:[creator],superAdminPubkey:SUPER_ADMIN_PUBKEY};
  const template=createAuthorizationEvent(grant);
  expect(template.kind).toBe(30302);
  expect(template.tags).toContainEqual(["d",cityId]);
  expect(JSON.parse(template.content)).toEqual(grant);
  expect(()=>createAuthorizationEvent({...grant,editorPubkeys:["b".repeat(64)]})).toThrow();
  expect(parseAuthorizationRecord(finalizeEvent(template,key))).toBeNull();
 });
});
