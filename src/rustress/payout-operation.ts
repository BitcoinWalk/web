import {z} from "zod";
import {verifyEvent,type Event} from "nostr-tools";

export const PAYOUT_OPERATION_CONTRACT="bitcoinwalk-payout-operation-v1";
export const MAXIMUM_PAYOUT_OPERATION_SECONDS=30*24*60*60;
const hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/),city=z.uuid();
const contentSchema=z.object({contract:z.literal(PAYOUT_OPERATION_CONTRACT),mode:z.literal("continuous"),release:z.string().regex(/^0\.[0-9]+\.[0-9]+$/),
 binding:hex,journalServiceId:z.uuid(),budgetMsat:money,maximumPayoutMsat:money,maximumFeeMsat:money,
 cityIds:z.array(city).min(1).max(10),notBefore:z.number().int().safe().positive(),expiresAt:z.number().int().safe().positive(),nonce:z.uuid()}).strict();
export type PayoutOperation=z.infer<typeof contentSchema>;
export type PayoutOperationExpected={admin:string;release:string;binding:string;journalServiceId:string;budgetMsat:string;
 maximumPayoutMsat:string;maximumFeeMsat:string;cityIds:string[]};

function canonicalCities(value:string[]){const cities=[...new Set(value)].sort();if(cities.length!==value.length||cities.some((entry,index)=>entry!==value[index]))throw new Error("Invalid payout operation cities");return cities;}

/** Renewable, restart-safe authority for the continuously supervised service.
 * It carries no credential and cannot authorize another release, wallet,
 * journal, policy or city. The signed event may be rechecked after restart for
 * the full bounded period; creation freshness is anchored to notBefore rather
 * than to every later restart. */
export function verifyPayoutOperation(input:unknown,expected:PayoutOperationExpected,now=Math.floor(Date.now()/1000)){
 const event=z.object({id:hex,pubkey:hex,created_at:z.number().int().safe().positive(),kind:z.literal(30312),tags:z.array(z.array(z.string())).max(20),content:z.string().max(4096),sig:z.string().regex(/^[0-9a-f]{128}$/)}).strict().parse(input) as Event;
 if(!verifyEvent({...event})||event.pubkey!==expected.admin)throw new Error("Invalid payout operation");
 const d=event.tags.filter(tag=>tag[0]==="d"),expiration=event.tags.filter(tag=>tag[0]==="expiration");
 if(event.tags.length!==2||d.length!==1||d[0].length!==2||d[0][1]!=="bitcoinwalk-rustress-payout-operation"||expiration.length!==1||expiration[0].length!==2)throw new Error("Invalid payout operation");
 const content=contentSchema.parse(JSON.parse(event.content)),actualCities=canonicalCities(content.cityIds),expectedCities=canonicalCities(expected.cityIds);
 if(expiration[0][1]!==String(content.expiresAt)||event.created_at>content.notBefore||content.notBefore-event.created_at>3600||content.notBefore>now||content.expiresAt<=now||
  content.expiresAt-content.notBefore>MAXIMUM_PAYOUT_OPERATION_SECONDS||content.release!==expected.release||content.binding!==expected.binding||
  content.journalServiceId!==expected.journalServiceId||content.budgetMsat!==expected.budgetMsat||content.maximumPayoutMsat!==expected.maximumPayoutMsat||
  content.maximumFeeMsat!==expected.maximumFeeMsat||JSON.stringify(actualCities)!==JSON.stringify(expectedCities))throw new Error("Payout operation does not match deployment");
 return content;
}
