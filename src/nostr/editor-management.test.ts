import { describe, expect, it } from "vitest";
import { nip19, type Event } from "nostr-tools";
import { editorPublicKey, editorChange, latestCityGrants, assertGrantUnchanged, assertPermissionSignature } from "./editor-management";
import { SUPER_ADMIN_PUBKEY } from "./authority";
import type { AuthorizationRecord } from "./city-records";

const creator="a".repeat(64),editor="b".repeat(64),other="c".repeat(64);
const record:AuthorizationRecord={event:{id:"d".repeat(64),created_at:10} as Event,grant:{cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",creatorPubkey:creator,creatorRevisionId:"e".repeat(64),editorPubkeys:[creator,editor],superAdminPubkey:SUPER_ADMIN_PUBKEY}};
describe("city editor management",()=>{
 it("decodes public npubs and rejects private keys and malformed input without echoing them",()=>{
  expect(editorPublicKey(` ${nip19.npubEncode(editor)} `)).toBe(editor);
  for(const value of [nip19.nsecEncode(new Uint8Array(32).fill(1)),editor,"npub1invalid", ""]) expect(()=>editorPublicKey(value)).toThrow();
 });
 it("adds only the requested editor while preserving city and creator references",()=>{
  const event=editorChange(record,SUPER_ADMIN_PUBKEY,"add",other,11);
  expect(JSON.parse(event.content)).toEqual({...record.grant,editorPubkeys:[creator,editor,other]});
  expect(event.tags).toContainEqual(["d",record.grant.cityId]);
  expect(event.created_at).toBe(11);
  expect(record.grant.editorPubkeys).toEqual([creator,editor]);
 });
 it("removes an editor without removing the creator",()=>{
  expect(JSON.parse(editorChange(record,SUPER_ADMIN_PUBKEY,"remove",editor,11).content).editorPubkeys).toEqual([creator]);
  expect(()=>editorChange(record,SUPER_ADMIN_PUBKEY,"remove",creator,11)).toThrow(/creator/);
  expect(()=>editorChange(record,SUPER_ADMIN_PUBKEY,"remove",SUPER_ADMIN_PUBKEY,11)).toThrow(/super-admin/);
 });
 it("refuses non-admin actors, duplicate additions, missing removals and old timestamps",()=>{
  expect(()=>editorChange(record,creator,"add",other,11)).toThrow(/super-admin/);
  expect(()=>editorChange(record,SUPER_ADMIN_PUBKEY,"add",editor,11)).toThrow(/already/);
  expect(()=>editorChange(record,SUPER_ADMIN_PUBKEY,"remove",other,11)).toThrow(/not on/);
  expect(()=>editorChange(record,SUPER_ADMIN_PUBKEY,"add",other,10)).toThrow(/newer timestamp/);
 });
 it("enforces the 100-editor limit",()=>{
  const full={...record,grant:{...record.grant,editorPubkeys:[creator,...Array.from({length:99},(_,i)=>(i+1).toString(16).padStart(64,"0"))]}};
  expect(()=>editorChange(full,SUPER_ADMIN_PUBKEY,"add",other,11)).toThrow();
 });
 it("uses the latest grant and rejects stale, missing and cross-city state",()=>{
  const newer={...record,event:{...record.event,id:"f".repeat(64),created_at:12}};
  expect(latestCityGrants([record,newer])).toEqual([newer]);
  expect(()=>assertGrantUnchanged(record,newer)).toThrow();
  expect(()=>assertGrantUnchanged(record,null)).toThrow();
  expect(()=>assertGrantUnchanged(record,{...record,grant:{...record.grant,cityId:crypto.randomUUID()}})).toThrow();
  expect(()=>assertGrantUnchanged(record,record)).not.toThrow();
 });
 it("rejects signer account and payload substitutions",()=>{
  const template=editorChange(record,SUPER_ADMIN_PUBKEY,"add",other,11);
  const signed={...template,id:"1".repeat(64),sig:"2".repeat(128),pubkey:SUPER_ADMIN_PUBKEY};
  expect(()=>assertPermissionSignature(signed,template,SUPER_ADMIN_PUBKEY)).not.toThrow();
  expect(()=>assertPermissionSignature({...signed,pubkey:editor},template,SUPER_ADMIN_PUBKEY)).toThrow();
  expect(()=>assertPermissionSignature({...signed,content:"{}"},template,SUPER_ADMIN_PUBKEY)).toThrow();
 });
});
