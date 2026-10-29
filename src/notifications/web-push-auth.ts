import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";

const clock=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const webPushPreferencesSchema=z.object({
 walkReminders:z.boolean(),workflowUpdates:z.boolean(),
 quietStart:clock.nullable(),quietEnd:clock.nullable(),
 timeZone:z.string().min(1).max(80),
}).superRefine((value,context)=>{if((value.quietStart===null)!==(value.quietEnd===null))context.addIssue({code:"custom",message:"Choose both quiet-hour times or neither."});try{new Intl.DateTimeFormat("en",{timeZone:value.timeZone});}catch{context.addIssue({code:"custom",message:"Choose a valid time zone."});}});
const subscription=z.object({endpoint:z.string().url().max(2048),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{40,200}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{16,100}$/)})});
export const webPushCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("list"),endpointHash:z.string().regex(/^[0-9a-f]{64}$/).optional()}),
 z.object({action:z.literal("save"),deviceId:z.string().uuid(),label:z.string().trim().min(1).max(40),subscription,preferences:webPushPreferencesSchema}),
 z.object({action:z.literal("preferences"),deviceId:z.string().uuid(),preferences:webPushPreferencesSchema}),
 z.object({action:z.literal("test"),deviceId:z.string().uuid()}),
 z.object({action:z.literal("remove"),deviceId:z.string().uuid()}),
]);
export type WebPushCommand=z.infer<typeof webPushCommandSchema>;
export type WebPushPreferences=z.infer<typeof webPushPreferencesSchema>;

export function webPushCommandTemplate(command:WebPushCommand,origin:string,now=Math.floor(Date.now()/1000)):EventTemplate{return {kind:27235,created_at:now,tags:[["u",`${origin}/api/notifications`],["method","POST"],["t","bitcoinwalk-web-push-v1"]],content:JSON.stringify(webPushCommandSchema.parse(command))};}
export function authorizeWebPushCommand(event:Event,origin:string,now=Math.floor(Date.now()/1000)):WebPushCommand{const tags=webPushCommandTemplate({action:"list"},origin,now).tags;if(!verifyEvent(event)||event.kind!==27235||Math.abs(now-event.created_at)>300||JSON.stringify(event.tags)!==JSON.stringify(tags))throw new Error("Fresh signed notification authorization required.");return webPushCommandSchema.parse(JSON.parse(event.content));}
