import {getEventHash,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {SUPER_ADMIN_PUBKEY} from "./authority";

export const CITY_BRAND_AUTOMATION_POLICY="bitcoinwalk-city-brand-automation-v1";
const hex=z.string().regex(/^[0-9a-f]{64}$/),timestamp=z.number().int().nonnegative();
const schema=z.object({contract:z.literal(CITY_BRAND_AUTOMATION_POLICY),policyRevision:z.literal(1),
 environment:z.enum(["staging","production"]),automationPubkey:hex,allowedAction:z.literal("activate"),
 maximumCities:z.number().int().positive().max(100),issuedAt:timestamp,nonce:z.uuid()}).strict();
export type CityBrandAutomationPolicy=z.infer<typeof schema>;

const tags=(policy:CityBrandAutomationPolicy)=>[["t",CITY_BRAND_AUTOMATION_POLICY],["environment",policy.environment],["p",policy.automationPubkey,"automation"]];

export function cityBrandAutomationPolicyTemplate(input:Omit<CityBrandAutomationPolicy,"contract"|"policyRevision"|"allowedAction">):EventTemplate{
 const policy=schema.parse({contract:CITY_BRAND_AUTOMATION_POLICY,policyRevision:1,allowedAction:"activate",...input});
 if(policy.automationPubkey===SUPER_ADMIN_PUBKEY)throw new Error("Automation must use a dedicated identity.");
 return {kind:27235,created_at:policy.issuedAt,tags:tags(policy),content:JSON.stringify(policy)};
}

export function readCityBrandAutomationPolicy(event:Event,environment:"staging"|"production",admin=SUPER_ADMIN_PUBKEY):CityBrandAutomationPolicy{
 const signed=JSON.parse(JSON.stringify(event)) as Event;
 if(getEventHash(signed)!==signed.id||!verifyEvent(signed)||signed.pubkey!==admin)throw new Error("Valid super-admin automation policy required.");
 const policy=schema.parse(JSON.parse(signed.content));
 if(policy.environment!==environment||signed.kind!==27235||signed.created_at!==policy.issuedAt||signed.content!==JSON.stringify(policy)||JSON.stringify(signed.tags)!==JSON.stringify(tags(policy)))throw new Error("Automation policy does not match this environment.");
 if(policy.automationPubkey===SUPER_ADMIN_PUBKEY)throw new Error("Automation must use a dedicated identity.");
 return policy;
}
