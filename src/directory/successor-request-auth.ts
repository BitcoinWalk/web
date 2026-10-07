import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";

export const directorySuccessorRequestCommand=z.discriminatedUnion("action",[
 z.object({action:z.literal("list")}).strict(),
 z.object({action:z.literal("prepare"),cityId:z.uuid()}).strict(),
 z.object({action:z.literal("sign"),requestId:z.uuid(),event:z.custom<Event>(value=>!!value&&typeof value==="object")}).strict(),
 z.object({action:z.literal("reject"),requestId:z.uuid()}).strict(),
 z.object({action:z.literal("supersede"),requestId:z.uuid()}).strict(),
]);
export type DirectorySuccessorRequestCommand=z.infer<typeof directorySuccessorRequestCommand>;

export function directorySuccessorRequestTemplate(command:DirectorySuccessorRequestCommand,origin:string,now=Math.floor(Date.now()/1000)):EventTemplate{
 return {kind:27235,created_at:now,tags:[["u",`${origin}/api/directory-successor-requests`],["method","POST"],["t","bitcoinwalk-directory-successor-request-v1"]],content:JSON.stringify(directorySuccessorRequestCommand.parse(command))};
}

export function authorizeDirectorySuccessorRequest(event:Event,origin:string,now=Math.floor(Date.now()/1000)):DirectorySuccessorRequestCommand{
 const expected=directorySuccessorRequestTemplate({action:"list"},origin,now).tags;
 if(!verifyEvent(event)||event.kind!==27235||Math.abs(now-event.created_at)>300||JSON.stringify(event.tags)!==JSON.stringify(expected))throw new Error("Directory successor request authorization required.");
 return directorySuccessorRequestCommand.parse(JSON.parse(event.content));
}
