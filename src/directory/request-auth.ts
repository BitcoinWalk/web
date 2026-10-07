import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";

const hex=z.string().regex(/^[0-9a-f]{64}$/);
export const directoryRequestCommand=z.discriminatedUnion("action",[
 z.object({action:z.literal("list")}).strict(),
 z.object({action:z.literal("prepare"),cityId:z.uuid(),primaryRelay:z.url(),mirrorRelays:z.array(z.url()).max(7),operatorPubkeys:z.array(hex).max(20)}).strict(),
 z.object({action:z.literal("sign"),requestId:z.uuid(),recoveryNpub:z.string().startsWith("npub1"),event:z.custom<Event>(value=>!!value&&typeof value==="object")}).strict(),
 z.object({action:z.literal("begin-activation"),requestId:z.uuid()}).strict(),
 z.object({action:z.literal("fail-activation"),requestId:z.uuid(),failure:z.enum(["transport-failed","confirmation-failed"])}).strict(),
 z.object({action:z.literal("confirm-activation"),requestId:z.uuid()}).strict(),
 z.object({action:z.literal("reject"),requestId:z.uuid()}).strict(),
 z.object({action:z.literal("supersede"),requestId:z.uuid()}).strict(),
]);
export type DirectoryRequestCommand=z.infer<typeof directoryRequestCommand>;

export function directoryRequestTemplate(command:DirectoryRequestCommand,origin:string,now=Math.floor(Date.now()/1000)):EventTemplate{
 return {kind:27235,created_at:now,tags:[["u",`${origin}/api/directory-requests`],["method","POST"],["t","bitcoinwalk-directory-request-v1"]],content:JSON.stringify(directoryRequestCommand.parse(command))};
}

export function authorizeDirectoryRequest(event:Event,origin:string,now=Math.floor(Date.now()/1000)):DirectoryRequestCommand{
 const expected=directoryRequestTemplate({action:"list"},origin,now).tags;
 if(!verifyEvent(event)||event.kind!==27235||Math.abs(now-event.created_at)>300||JSON.stringify(event.tags)!==JSON.stringify(expected))throw new Error("Directory request authorization required.");
 return directoryRequestCommand.parse(JSON.parse(event.content));
}
