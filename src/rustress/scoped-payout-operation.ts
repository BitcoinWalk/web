import {z} from "zod";
import {verifyEvent,type Event} from "nostr-tools";

export const SCOPED_PAYOUT_OPERATION_CONTRACT="bitcoinwalk-payout-operation-v3";
export const VERIFIED_PRO_CITY_SCOPE="verified-pro-entitlement-v1";
export const PAYOUT_BUDGET_RENEWAL="monthly" as const;
const hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/);
const contentSchema=z.object({contract:z.literal(SCOPED_PAYOUT_OPERATION_CONTRACT),mode:z.literal("continuous"),policyRevision:z.literal(1),
 binding:hex,journalServiceId:z.uuid(),budgetMsat:money,budgetRenewal:z.literal(PAYOUT_BUDGET_RENEWAL),maximumPayoutMsat:money,maximumFeeMsat:money,
 cityScope:z.literal(VERIFIED_PRO_CITY_SCOPE),authorityBinding:hex,maximumCities:z.number().int().min(1).max(100),
 issuedAt:z.number().int().safe().positive(),nonce:z.uuid()}).strict();
export type ScopedPayoutOperation=z.infer<typeof contentSchema>;
export type ScopedPayoutOperationExpected={admin:string;binding:string;journalServiceId:string;budgetMsat:string;budgetRenewal:typeof PAYOUT_BUDGET_RENEWAL;
 maximumPayoutMsat:string;maximumFeeMsat:string;cityScope:typeof VERIFIED_PRO_CITY_SCOPE;authorityBinding:string;maximumCities:number};

/** A durable, explicitly revocable portfolio authority. The signer authorizes one pinned private
 * enrollment channel, never arbitrary browser input. That channel can register
 * only the strict managed configuration: verified city UUID, fixed 79/21 split,
 * immutable payout version and non-circular owner-confirmed destination. It has
 * no calendar expiry; protected-file removal, invoice-only mode or NWC
 * revocation stops sends. */
export function verifyScopedPayoutOperation(input:unknown,expected:ScopedPayoutOperationExpected,now=Math.floor(Date.now()/1000)){
 const event=z.object({id:hex,pubkey:hex,created_at:z.number().int().safe().positive(),kind:z.literal(30312),tags:z.array(z.array(z.string())).max(20),content:z.string().max(4096),sig:z.string().regex(/^[0-9a-f]{128}$/)}).strict().parse(input) as Event;
 if(!verifyEvent({...event})||event.pubkey!==expected.admin)throw new Error("Invalid scoped payout operation");
 const d=event.tags.filter(tag=>tag[0]==="d");
 if(event.tags.length!==1||d.length!==1||d[0].length!==2||d[0][1]!=="bitcoinwalk-rustress-payout-operation")throw new Error("Invalid scoped payout operation");
 const content=contentSchema.parse(JSON.parse(event.content));
 if(event.created_at>content.issuedAt||content.issuedAt-event.created_at>3600||content.issuedAt>now||content.binding!==expected.binding||
  content.journalServiceId!==expected.journalServiceId||content.budgetMsat!==expected.budgetMsat||content.budgetRenewal!==expected.budgetRenewal||content.maximumPayoutMsat!==expected.maximumPayoutMsat||
  content.maximumFeeMsat!==expected.maximumFeeMsat||content.cityScope!==expected.cityScope||content.authorityBinding!==expected.authorityBinding||
  content.maximumCities!==expected.maximumCities)throw new Error("Scoped payout operation does not match deployment");
 return content;
}
