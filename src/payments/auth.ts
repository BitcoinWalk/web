import {z} from "zod";
import {getEventHash,verifyEvent, type Event, type EventTemplate} from "nostr-tools";

export const paymentCommand = z.discriminatedUnion("action", [
  z.object({action:z.literal("create"), cityId:z.uuid(), revisionId:z.string().regex(/^[0-9a-f]{64}$/), payoutDestination:z.string().trim().min(5).max(500)}).strict(),
  z.object({action:z.literal("status"), cityId:z.uuid()}).strict(),
  z.object({action:z.literal("list")}).strict(),
]);
export type PaymentCommand = z.infer<typeof paymentCommand>;
export function paymentRequest(command:PaymentCommand, origin:string, now=Math.floor(Date.now()/1000)):EventTemplate {
  return {kind:27235, created_at:now, tags:[["u",`${origin}/api/payments`],["method","POST"],["t","bitcoinwalk-city-payment-v1"]], content:JSON.stringify(paymentCommand.parse(command))};
}
export function authorizePayment(event:Event, origin:string, now=Math.floor(Date.now()/1000)):PaymentCommand {
  const signed:Event=JSON.parse(JSON.stringify(event)),tags = paymentRequest({action:"list"},origin,now).tags;
  if(getEventHash(signed)!==signed.id||!verifyEvent(signed)||signed.kind!==27235||Math.abs(now-signed.created_at)>300||JSON.stringify(signed.tags)!==JSON.stringify(tags))throw new Error("Payment authorization required. Reconnect and retry.");
  return paymentCommand.parse(JSON.parse(signed.content));
}
