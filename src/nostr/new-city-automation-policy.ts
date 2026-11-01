import {getEventHash,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {SUPER_ADMIN_PUBKEY} from "./authority";

export const NEW_CITY_AUTOMATION_POLICY="bitcoinwalk-new-city-automation-v1";
const hex=z.string().regex(/^[0-9a-f]{64}$/),schema=z.object({contract:z.literal(NEW_CITY_AUTOMATION_POLICY),policyRevision:z.literal(1),environment:z.literal("staging"),automationPubkey:hex,cityId:z.uuid(),revisionId:hex,organizerPubkey:hex,initialEventIds:z.array(hex).min(1).max(8),issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive(),nonce:z.uuid()}).strict().refine(value=>new Set(value.initialEventIds).size===value.initialEventIds.length&&value.expiresAt>value.issuedAt&&value.expiresAt-value.issuedAt<=86400,"Policy must be unique and expire within 24 hours.");
export type NewCityAutomationPolicy=z.infer<typeof schema>;
const tags=(policy:NewCityAutomationPolicy)=>[["t",NEW_CITY_AUTOMATION_POLICY],["environment",policy.environment],["p",policy.automationPubkey,"automation"],["i",policy.cityId],["e",policy.revisionId,"","city-revision"],...policy.initialEventIds.map(id=>["e",id,"","initial-walk"] )];

export function newCityAutomationPolicyTemplate(input:Omit<NewCityAutomationPolicy,"contract"|"policyRevision"|"environment">):EventTemplate{
 const policy=schema.parse({contract:NEW_CITY_AUTOMATION_POLICY,policyRevision:1,environment:"staging",...input});
 if(policy.automationPubkey===SUPER_ADMIN_PUBKEY)throw new Error("Automation must use a dedicated identity.");
 return {kind:27235,created_at:policy.issuedAt,tags:tags(policy),content:JSON.stringify(policy)};
}

export function readNewCityAutomationPolicy(event:Event,now=Math.floor(Date.now()/1000),admin=SUPER_ADMIN_PUBKEY):NewCityAutomationPolicy{
 const signed=JSON.parse(JSON.stringify(event)) as Event;
 if(getEventHash(signed)!==signed.id||!verifyEvent(signed)||signed.pubkey!==admin)throw new Error("Valid super-admin new-city policy required.");
 const policy=schema.parse(JSON.parse(signed.content));
 if(policy.expiresAt<=now||signed.kind!==27235||signed.created_at!==policy.issuedAt||signed.content!==JSON.stringify(policy)||JSON.stringify(signed.tags)!==JSON.stringify(tags(policy)))throw new Error("New-city policy is expired or has changed.");
 return policy;
}
