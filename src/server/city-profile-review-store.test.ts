import {DatabaseSync} from "node:sqlite";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {describe,it,expect,vi} from "vitest";
vi.mock("../nostr/authority",async()=>{const {getPublicKey}=await import("nostr-tools");return {SUPER_ADMIN_PUBKEY:getPublicKey(new Uint8Array(32).fill(1))};});
import {proSetupTemplate} from "../nostr/pro-setup-command";
import {profileAccepted,profileFingerprint,saveProfileReview} from "./city-profile-review-store";
const cityId="11111111-1111-4111-8111-111111111111",origin="https://bitcoinwalk.org",key=new Uint8Array(32).fill(1),pubkey=getPublicKey(key);
const fingerprint=profileFingerprint(cityId,"binding",pubkey,"Hannover","https://bitcoinwalk.org/avatar.webp",origin);
const preview={fingerprint,pubkey,name:"Hannover",picture:"https://bitcoinwalk.org/avatar.webp",website:origin,eligible:true,accepted:false};
const signed=(secret=key)=>finalizeEvent(proSetupTemplate({action:"accept-city-profile",cityId,fingerprint},origin),secret);
describe("appearance-only approval",()=>{
 it("persists exact approval idempotently without creating any payment table",()=>{
  const db=new DatabaseSync(":memory:");expect(profileAccepted(db,cityId,fingerprint)).toBe(false);
  saveProfileReview(db,signed(),origin,preview,cityId);saveProfileReview(db,signed(),origin,preview,cityId);
  expect(profileAccepted(db,cityId,fingerprint)).toBe(true);
  expect(db.prepare("SELECT count(*) AS n FROM city_profile_review").get()).toEqual({n:1});
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([{name:"city_profile_review"}]);db.close();
 });
 it("rejects wrong signer, stale preview, wrong city and insufficient evidence",()=>{
  const db=new DatabaseSync(":memory:");
  expect(()=>saveProfileReview(db,signed(new Uint8Array(32).fill(2)),origin,preview,cityId)).toThrow();
  expect(()=>saveProfileReview(db,signed(),origin,{...preview,fingerprint:"a".repeat(64)},cityId)).toThrow();
  expect(()=>saveProfileReview(db,signed(),origin,preview,"22222222-2222-4222-8222-222222222222")).toThrow();
  expect(()=>saveProfileReview(db,signed(),origin,{...preview,eligible:false},cityId)).toThrow();
  expect(profileAccepted(db,cityId,fingerprint)).toBe(false);db.close();
 });
 it("binds acceptance to city, binding, signer, name, avatar and website, not unrelated NIP-05 fields",()=>{
  const values=[cityId,"binding",pubkey,"Hannover","https://bitcoinwalk.org/avatar.webp",origin] as const;
  for(let i=0;i<values.length;i++){const changed=[...values];changed[i]+="changed";expect(profileFingerprint(...changed as unknown as typeof values)).not.toBe(fingerprint);}
 });
});
