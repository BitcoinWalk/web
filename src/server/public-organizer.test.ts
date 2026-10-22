import {describe, expect, it} from "vitest";
import {nip19} from "nostr-tools";
import type {CalendarWalk} from "../nostr/calendar-records";
import type {AuthorizationRecord} from "../nostr/city-records";
import {publicOrganizerNpubs} from "./public-organizer";

const cityId="00000000-0000-4000-8000-000000000001";
const original="1".repeat(64), transferred="2".repeat(64);
const walk={revision:{event:{pubkey:original},city:{cityId}}} as CalendarWalk;
function grant(created_at:number,ownerPubkey?:string):AuthorizationRecord {
  return {event:{created_at,id:String(created_at)},grant:{cityId,creatorPubkey:original,creatorRevisionId:"3".repeat(64),editorPubkeys:[ownerPubkey??original],superAdminPubkey:"4".repeat(64),...(ownerPubkey?{version:2 as const,ownerPubkey,ownershipEventId:"5".repeat(64)}:{})}} as AuthorizationRecord;
}

describe("public organizer NPUB resolution",()=>{
  it("uses the latest transferred city owner",()=>{
    expect(publicOrganizerNpubs([walk],[grant(10),grant(20,transferred)]).get(cityId)).toBe(nip19.npubEncode(transferred));
  });
  it("keeps the organizer-signed revision for a legacy city without a grant",()=>{
    expect(publicOrganizerNpubs([walk],[]).get(cityId)).toBe(nip19.npubEncode(original));
  });
});
