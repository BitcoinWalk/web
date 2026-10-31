import {z} from "zod";
import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";

export const idleCitySchema=z.object({cityId:z.string().uuid(),cityName:z.string().min(1).max(100),recipient:z.string().regex(/^[0-9a-f]{64}$/),empty:z.boolean(),allowed:z.boolean(),preferenceVersion:z.number().int().nonnegative()}).strict();
export const idleSnapshotSchema=z.object({version:z.literal(1),checkedAt:z.number().int().nonnegative(),paused:z.boolean(),cities:z.array(idleCitySchema).max(1000)}).strict();
export type IdleCity=z.infer<typeof idleCitySchema>;
export type IdleSnapshot=z.infer<typeof idleSnapshotSchema>;
export const idleCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("read"),cityId:z.string().uuid()}).strict(),
 z.object({action:z.literal("save"),cityId:z.string().uuid(),choice:z.enum(["on","off","30","90"]),version:z.number().int().nonnegative()}).strict(),
]);
export type IdleCommand=z.infer<typeof idleCommandSchema>;
export function idleCommandTemplate(command:IdleCommand,origin:string,now=Math.floor(Date.now()/1000)):EventTemplate{
 return {kind:27235,created_at:now,tags:[["u",`${origin}/api/guide-reminders`],["method","POST"],["t","bitcoinwalk-idle-reminders-v1"]],content:JSON.stringify(idleCommandSchema.parse(command))};
}
export function authorizeIdleCommand(event:Event,origin:string,now=Math.floor(Date.now()/1000)):IdleCommand{
 if(!verifyEvent(event)||event.kind!==27235||Math.abs(now-event.created_at)>300||JSON.stringify(event.tags)!==JSON.stringify(idleCommandTemplate({action:"read",cityId:"00000000-0000-4000-8000-000000000000"},origin).tags))throw Error("Fresh signed authorization required.");
 return idleCommandSchema.parse(JSON.parse(event.content));
}
