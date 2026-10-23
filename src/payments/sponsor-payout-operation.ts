import {z} from "zod";
import {verifyEvent,type Event} from "nostr-tools";

export const SPONSOR_PAYOUT_OPERATION_CONTRACT="bitcoinwalk-sponsor-payout-operation-v1";
export const MAXIMUM_SPONSOR_PAYOUT_OPERATION_SECONDS=7*24*60*60;
const hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/),city=z.uuid(),ref=z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
export const sponsorPayoutOrderScopeSchema=z.object({orderId:z.uuid(),paymentHash:hex,receivedMsat:money,hostPubkey:hex,payoutVersion:z.number().int().safe().positive(),destinationFingerprint:hex}).strict();
export type SponsorPayoutOrderScope=z.infer<typeof sponsorPayoutOrderScopeSchema>;
const contentSchema=z.object({contract:z.literal(SPONSOR_PAYOUT_OPERATION_CONTRACT),mode:z.literal("continuous"),release:z.string().regex(/^0\.[0-9]+\.[0-9]+$/),
 binding:hex,walletRef:ref,journalServiceId:z.uuid(),budgetMsat:money,maximumPayoutMsat:money,maximumFeeMsat:money,
 cityIds:z.array(city).min(1).max(100),order:sponsorPayoutOrderScopeSchema.optional(),notBefore:z.number().int().safe().positive(),expiresAt:z.number().int().safe().positive(),nonce:z.uuid()}).strict();
export type SponsorPayoutOperation=z.infer<typeof contentSchema>;
export type SponsorPayoutOperationExpected={admin:string;release:string;binding:string;walletRef:string;journalServiceId:string;budgetMsat:string;maximumPayoutMsat:string;maximumFeeMsat:string;cityIds:string[];order?:SponsorPayoutOrderScope};

function canonicalCities(value:string[]){const cities=[...new Set(value)].sort();if(cities.length!==value.length||cities.some((entry,index)=>entry!==value[index]))throw new Error("Invalid sponsor payout operation cities");return cities;}

/** Short-lived super-admin authority for one exact sponsorship sender release,
 * wallet binding, off-host journal, lifetime budget and reviewed city set. */
export function verifySponsorPayoutOperation(input:unknown,expected:SponsorPayoutOperationExpected,now=Math.floor(Date.now()/1000)){
 const event=z.object({id:hex,pubkey:hex,created_at:z.number().int().safe().positive(),kind:z.literal(30312),tags:z.array(z.array(z.string())).max(20),content:z.string().max(4096),sig:z.string().regex(/^[0-9a-f]{128}$/)}).strict().parse(input) as Event;
 if(!verifyEvent({...event})||event.pubkey!==expected.admin)throw new Error("Invalid sponsor payout operation");
 const d=event.tags.filter(tag=>tag[0]==="d"),expiration=event.tags.filter(tag=>tag[0]==="expiration");
 if(event.tags.length!==2||d.length!==1||d[0].length!==2||d[0][1]!=="bitcoinwalk-sponsor-payout-operation"||expiration.length!==1||expiration[0].length!==2)throw new Error("Invalid sponsor payout operation");
 const content=contentSchema.parse(JSON.parse(event.content)),actualCities=canonicalCities(content.cityIds),expectedCities=canonicalCities(expected.cityIds);
 const expectedOrder=expected.order===undefined?undefined:sponsorPayoutOrderScopeSchema.parse(expected.order);
 if(JSON.stringify(content.order)!==JSON.stringify(expectedOrder))throw new Error("Sponsor payout order does not match deployment");
 if(expiration[0][1]!==String(content.expiresAt)||event.created_at>content.notBefore||content.notBefore-event.created_at>3600||content.notBefore>now||content.expiresAt<=now||
  content.expiresAt-content.notBefore>MAXIMUM_SPONSOR_PAYOUT_OPERATION_SECONDS||content.release!==expected.release||content.binding!==expected.binding||content.walletRef!==expected.walletRef||
  content.journalServiceId!==expected.journalServiceId||content.budgetMsat!==expected.budgetMsat||content.maximumPayoutMsat!==expected.maximumPayoutMsat||
  content.maximumFeeMsat!==expected.maximumFeeMsat||JSON.stringify(actualCities)!==JSON.stringify(expectedCities))throw new Error("Sponsor payout operation does not match deployment");
 return content;
}
