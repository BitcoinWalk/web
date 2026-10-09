import {z} from "zod";
import {verifyEvent,type Event} from "nostr-tools";

export const PAYOUT_ACTIVATION_CONTRACT="bitcoinwalk-payout-activation-v1";
const hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/);
const contentSchema=z.object({contract:z.literal(PAYOUT_ACTIVATION_CONTRACT),release:z.string().regex(/^0\.[0-9]+\.[0-9]+$/),
 binding:hex,journalServiceId:z.uuid(),budgetMsat:money,maximumPayoutMsat:money,maximumFeeMsat:money,
 notBefore:z.number().int().safe().positive(),expiresAt:z.number().int().safe().positive(),nonce:z.uuid()}).strict();
export type PayoutActivation=z.infer<typeof contentSchema>;

/** Offline-verifiable operator grant. It contains no credential and cannot
 * activate a mismatched release, wallet, journal or policy. */
export function verifyPayoutActivation(input:unknown,expected:{admin:string;release:string;binding:string;journalServiceId:string;
 budgetMsat:string;maximumPayoutMsat:string;maximumFeeMsat:string},now=Math.floor(Date.now()/1000)){
 const event=z.object({id:hex,pubkey:hex,created_at:z.number().int().safe(),kind:z.literal(30312),tags:z.array(z.array(z.string())).max(16),content:z.string().max(4096),sig:z.string().regex(/^[0-9a-f]{128}$/)}).strict().parse(input) as Event;
 if(!verifyEvent({...event})||event.pubkey!==expected.admin||event.created_at>now||now-event.created_at>3600)throw new Error("Invalid payout activation");
 const d=event.tags.filter(tag=>tag[0]==="d"),expiration=event.tags.filter(tag=>tag[0]==="expiration");
 if(d.length!==1||d[0].length!==2||d[0][1]!=="bitcoinwalk-rustress-payout"||expiration.length!==1||expiration[0].length!==2)throw new Error("Invalid payout activation");
 const content=contentSchema.parse(JSON.parse(event.content));
 if(Number(expiration[0][1])!==content.expiresAt||content.notBefore>now||content.expiresAt<=now||content.expiresAt-content.notBefore>86400||
  content.release!==expected.release||content.binding!==expected.binding||content.journalServiceId!==expected.journalServiceId||content.budgetMsat!==expected.budgetMsat||
  content.maximumPayoutMsat!==expected.maximumPayoutMsat||content.maximumFeeMsat!==expected.maximumFeeMsat)throw new Error("Payout activation does not match deployment");
 return content;
}
