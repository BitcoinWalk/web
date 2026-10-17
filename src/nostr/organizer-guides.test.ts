import {finalizeEvent,getPublicKey} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {organizerGuidesMembers,organizerGuidesMetadataTemplate,organizerGuidesRosterPlan,verifiedOrganizerGuidesMetadata} from "./organizer-guides";

const key=(fill:number)=>new Uint8Array(32).fill(fill),pub=(fill:number)=>getPublicKey(key(fill));
describe("BitcoinWalk Guides organizer room",()=>{
 it("deduplicates HQ, Guide and every current organizer",()=>expect(organizerGuidesMembers([{organizerPubkey:pub(2),guidePubkey:pub(3)},{organizerPubkey:pub(2),guidePubkey:pub(3)},{organizerPubkey:pub(4),guidePubkey:pub(3)}],pub(1))).toEqual([pub(1),pub(2),pub(3),pub(4)].sort()));
 it("adds current owners and removes superseded owners",()=>expect(organizerGuidesRosterPlan([pub(1),pub(5)],[pub(1),pub(2)])).toEqual({add:[pub(2)],remove:[pub(5)]}));
 it("requires relay-signed private, restricted and closed metadata",()=>{
  const relay=pub(6),template=organizerGuidesMetadataTemplate(10),metadata=finalizeEvent({kind:39000,created_at:11,tags:template.tags.map(tag=>tag[0]==="h"?["d",tag[1]]:tag),content:""},key(6));
  expect(verifiedOrganizerGuidesMetadata([metadata],relay)).toBe(true);
  expect(verifiedOrganizerGuidesMetadata([{...metadata,tags:metadata.tags.filter(tag=>tag[0]!=="private")}],relay)).toBe(false);
 });
});
