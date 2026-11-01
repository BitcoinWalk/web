import {getEventHash,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {SUPER_ADMIN_PUBKEY} from "./authority";

export const CITY_REVISION_AUTOMATION_POLICY="bitcoinwalk-city-revision-automation-v1";
const hex=z.string().regex(/^[0-9a-f]{64}$/),schema=z.object({contract:z.literal(CITY_REVISION_AUTOMATION_POLICY),policyRevision:z.literal(1),environment:z.enum(["staging","production"]),automationPubkey:hex,allowedFields:z.tuple([z.literal("startAt"),z.literal("description"),z.literal("meetingPoint")]),maximumRevisions:z.number().int().positive().max(100),issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive(),nonce:z.uuid()}).strict().refine(value=>value.expiresAt>value.issuedAt&&value.expiresAt-value.issuedAt<=30*86400,"Policy lifetime must be 30 days or less.");
export type CityRevisionAutomationPolicy=z.infer<typeof schema>;
const tags=(policy:CityRevisionAutomationPolicy)=>[["t",CITY_REVISION_AUTOMATION_POLICY],["environment",policy.environment],["p",policy.automationPubkey,"automation"]];

export function cityRevisionAutomationPolicyTemplate(input:Omit<CityRevisionAutomationPolicy,"contract"|"policyRevision"|"allowedFields">):EventTemplate{
 const policy=schema.parse({contract:CITY_REVISION_AUTOMATION_POLICY,policyRevision:1,allowedFields:["startAt","description","meetingPoint"],...input});
 if(policy.automationPubkey===SUPER_ADMIN_PUBKEY)throw new Error("Automation must use a dedicated identity.");
 return {kind:27235,created_at:policy.issuedAt,tags:tags(policy),content:JSON.stringify(policy)};
}

export function readCityRevisionAutomationPolicy(event:Event,environment:"staging"|"production",now=Math.floor(Date.now()/1000),admin=SUPER_ADMIN_PUBKEY):CityRevisionAutomationPolicy{
 const signed=JSON.parse(JSON.stringify(event)) as Event;
 if(getEventHash(signed)!==signed.id||!verifyEvent(signed)||signed.pubkey!==admin)throw new Error("Valid super-admin revision automation policy required.");
 const policy=schema.parse(JSON.parse(signed.content));
 if(policy.environment!==environment||policy.expiresAt<=now||signed.kind!==27235||signed.created_at!==policy.issuedAt||signed.content!==JSON.stringify(policy)||JSON.stringify(signed.tags)!==JSON.stringify(tags(policy)))throw new Error("Revision automation policy is expired or does not match this environment.");
 if(policy.automationPubkey===SUPER_ADMIN_PUBKEY)throw new Error("Automation must use a dedicated identity.");
 return policy;
}
