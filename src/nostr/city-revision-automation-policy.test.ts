import {finalizeEvent,getPublicKey} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {cityRevisionAutomationPolicyTemplate,readCityRevisionAutomationPolicy} from "./city-revision-automation-policy";

const admin=new Uint8Array(32).fill(1),automation=getPublicKey(new Uint8Array(32).fill(2));
const policy=()=>finalizeEvent(cityRevisionAutomationPolicyTemplate({environment:"staging",automationPubkey:automation,maximumRevisions:3,issuedAt:100,expiresAt:200,nonce:"00000000-0000-4000-8000-000000000001"}),admin);
describe("city revision automation policy",()=>{
 it("binds the dedicated key, environment, fields, lifetime and cap",()=>expect(readCityRevisionAutomationPolicy(policy(),"staging",150,getPublicKey(admin))).toMatchObject({automationPubkey:automation,allowedFields:["startAt","description","meetingPoint"],maximumRevisions:3}));
 it("rejects expiry and a different environment",()=>{expect(()=>readCityRevisionAutomationPolicy(policy(),"staging",200,getPublicKey(admin))).toThrow("expired");expect(()=>readCityRevisionAutomationPolicy(policy(),"production",150,getPublicKey(admin))).toThrow("environment");});
});
