import {finalizeEvent,getPublicKey} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
import {AUTOMATED_CITY_REVISION_NOTE} from "./city-revision-automation-contract";
import {parseApprovalRecord} from "./city-records";
import {createApprovalEvent} from "./city-event";
const key=new Uint8Array(32).fill(7),pubkey=getPublicKey(key),cityId="00000000-0000-4000-8000-000000000001",revision="b".repeat(64);
afterEach(()=>vi.unstubAllEnvs());
describe("automated city approval reader",()=>{
 it("accepts only the configured key's minimal marked approval",()=>{vi.stubEnv("NEXT_PUBLIC_CITY_REVISION_AUTOMATION_PUBKEY",pubkey);const event=finalizeEvent(createApprovalEvent({cityId,cityRevisionId:revision,status:"approved",note:AUTOMATED_CITY_REVISION_NOTE}),key);expect(parseApprovalRecord(event)?.approval.cityRevisionId).toBe(revision);});
 it("rejects privileged fields and an unconfigured key",()=>{vi.stubEnv("NEXT_PUBLIC_CITY_REVISION_AUTOMATION_PUBKEY",pubkey);const privileged=finalizeEvent(createApprovalEvent({cityId,cityRevisionId:revision,status:"approved",note:AUTOMATED_CITY_REVISION_NOTE,slug:"other"}),key);expect(parseApprovalRecord(privileged)).toBeNull();vi.stubEnv("NEXT_PUBLIC_CITY_REVISION_AUTOMATION_PUBKEY","");const minimal=finalizeEvent(createApprovalEvent({cityId,cityRevisionId:revision,status:"approved",note:AUTOMATED_CITY_REVISION_NOTE}),key);expect(parseApprovalRecord(minimal)).toBeNull();});
});
