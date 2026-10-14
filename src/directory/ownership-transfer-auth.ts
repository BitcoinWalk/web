import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
const event=z.custom<Event>(value=>!!value&&typeof value==="object");
export const ownershipTransferCommand=z.discriminatedUnion("action",[
 z.object({action:z.literal("list")}).strict(),
 z.object({action:z.literal("prepare"),cityId:z.uuid(),nextOwnerPubkey:z.string().regex(/^[0-9a-f]{64}$/),retainEditors:z.boolean()}).strict(),
 z.object({action:z.literal("sign-owner"),requestId:z.uuid(),event}).strict(),
 z.object({action:z.literal("prepare-activation"),requestId:z.uuid()}).strict(),
 z.object({action:z.literal("confirm-activation"),requestId:z.uuid(),cmsEvent:event}).strict(),
 z.object({action:z.literal("supersede"),requestId:z.uuid()}).strict(),
]);
export type OwnershipTransferCommand=z.infer<typeof ownershipTransferCommand>;
export function ownershipTransferCommandTemplate(command:OwnershipTransferCommand,origin:string,now=Math.floor(Date.now()/1000)):EventTemplate{return {kind:27235,created_at:now,tags:[["u",`${origin}/api/ownership-transfers`],["method","POST"],["t","bitcoinwalk-city-ownership-transfer-v1"]],content:JSON.stringify(ownershipTransferCommand.parse(command))};}
export function authorizeOwnershipTransferCommand(event:Event,origin:string,now=Math.floor(Date.now()/1000)){const expected=ownershipTransferCommandTemplate({action:"list"},origin,now);if(!verifyEvent(event)||event.kind!==expected.kind||Math.abs(now-event.created_at)>300||JSON.stringify(event.tags)!==JSON.stringify(expected.tags))throw new Error("Ownership transfer authorization required.");return ownershipTransferCommand.parse(JSON.parse(event.content));}
