import {finalizeEvent,getPublicKey} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
import {SUPER_ADMIN_PUBKEY} from "./authority";
import {createApprovalEvent,createAutomatedNewCityAuthorizationEvent} from "./city-event";
import {parseApprovalRecord,parseAuthorizationRecord} from "./city-records";
import {AUTOMATED_NEW_CITY_NOTE,newCityAutomationAuthorities,RETAINED_STAGING_NEW_CITY_AUTOMATION_PUBKEY} from "./new-city-automation-contract";

const key=new Uint8Array(32).fill(9),pubkey=getPublicKey(key),cityId="00000000-0000-4000-8000-000000000009",revision="a".repeat(64),walk="b".repeat(64);
afterEach(()=>vi.unstubAllEnvs());
describe("automated new city reader",()=>{
 it("retains the accepted staging authority without trusting it in production",()=>{vi.stubEnv("NEXT_PUBLIC_NEW_CITY_AUTOMATION_PUBKEY","");vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_PROFILE","staging");expect(newCityAutomationAuthorities(SUPER_ADMIN_PUBKEY)).toEqual([RETAINED_STAGING_NEW_CITY_AUTOMATION_PUBKEY]);vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_PROFILE","production");expect(newCityAutomationAuthorities(SUPER_ADMIN_PUBKEY)).toEqual([]);});
 it("accepts only the configured key's exact owner grant and first-walk approval",()=>{vi.stubEnv("NEXT_PUBLIC_NEW_CITY_AUTOMATION_PUBKEY",pubkey);const grant={cityId,creatorPubkey:"c".repeat(64),creatorRevisionId:revision,editorPubkeys:["c".repeat(64)],superAdminPubkey:SUPER_ADMIN_PUBKEY};expect(parseAuthorizationRecord(finalizeEvent(createAutomatedNewCityAuthorizationEvent(grant),key))?.grant.cityId).toBe(cityId);expect(parseApprovalRecord(finalizeEvent(createApprovalEvent({cityId,cityRevisionId:revision,initialEventIds:[walk],status:"approved",note:AUTOMATED_NEW_CITY_NOTE}),key))?.approval.initialEventIds).toEqual([walk]);});
 it("rejects a broadened editor grant and an approval without first walks",()=>{vi.stubEnv("NEXT_PUBLIC_NEW_CITY_AUTOMATION_PUBKEY",pubkey);const grant={cityId,creatorPubkey:"c".repeat(64),creatorRevisionId:revision,editorPubkeys:["c".repeat(64),"d".repeat(64)],superAdminPubkey:SUPER_ADMIN_PUBKEY};expect(parseAuthorizationRecord(finalizeEvent(createAutomatedNewCityAuthorizationEvent(grant),key))).toBeNull();expect(parseApprovalRecord(finalizeEvent(createApprovalEvent({cityId,cityRevisionId:revision,status:"approved",note:AUTOMATED_NEW_CITY_NOTE}),key))).toBeNull();});
});
