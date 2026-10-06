import {z} from "zod";
import {compareEvents,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {isSuperAdmin,SUPER_ADMIN_PUBKEY} from "./authority";
import {queryRelayEvents} from "./city-records";

export const EVENT_MODERATION_KIND=30310;
const hex=z.string().regex(/^[0-9a-f]{64}$/);
export const eventModerationSchema=z.object({cityId:z.string().uuid().optional(),scope:z.enum(["event","city","author","organizer"]),target:z.string().min(1).max(300),eventId:hex.optional(),status:z.enum(["hidden","visible","suspended","active"]),reason:z.string().min(1).max(500).refine(v=>v.trim().length>0),previous:hex.optional()}).strict().superRefine((m,ctx)=>{
 const valid=m.scope==="organizer"?!m.cityId&&!m.eventId&&/^[0-9a-f]{64}$/.test(m.target)&&["suspended","active"].includes(m.status):!!m.cityId&&(m.scope==="event"?/^31923:[0-9a-f]{64}:.+$/.test(m.target)&&!!m.eventId&&["hidden","visible"].includes(m.status):!m.eventId&&["suspended","active"].includes(m.status)&&(m.scope==="city"?m.target===m.cityId:/^[0-9a-f]{64}$/.test(m.target)));
 if(!valid)ctx.addIssue({code:"custom",message:"Invalid moderation scope, target or status."});
});
export type EventModeration=z.infer<typeof eventModerationSchema>;
export type EventModerationRecord={event:Event;decision:EventModeration};
export const moderationKey=(m:Pick<EventModeration,"scope"|"target">)=>`${m.scope}:${m.target}`;
export function walkAddress(event:Event){const tags=event.tags.filter(t=>t[0]==="d");if(event.kind!==31923||!verifyEvent(event)||tags.length!==1||tags[0].length!==2||!tags[0][1])throw new Error("Invalid signed walk address.");return `31923:${event.pubkey}:${tags[0][1]}`;}
export function createEventModeration(input:EventModeration):EventTemplate{
 const m=eventModerationSchema.parse(input);
 const scoped=m.scope!=="organizer";
 return {kind:EVENT_MODERATION_KIND,created_at:Math.floor(Date.now()/1000),content:JSON.stringify(m),tags:[["d",scoped?`${m.cityId}:${crypto.randomUUID()}`:`organizer:${crypto.randomUUID()}`],...(scoped?[["i",m.cityId!]]:[]),["m",moderationKey(m)],["status",m.status],["client","bitcoinwalk.org"]]};
}
export function parseEventModeration(event:Event):EventModerationRecord|null{
 if(event.kind!==EVENT_MODERATION_KIND||!isSuperAdmin(event.pubkey)||!verifyEvent(event))return null;
 try{const decision=eventModerationSchema.parse(JSON.parse(event.content));const tags=event.tags;
  const scoped=decision.scope!=="organizer";
  if(tags.length!==(scoped?5:4)||tags.some(t=>t.length!==2))return null;
  const one=(name:string,value:string)=>tags.filter(t=>t[0]===name).length===1&&tags.some(t=>t[0]===name&&t[1]===value);
  const d=tags.find(t=>t[0]==="d")?.[1];
  if(scoped){if(!decision.cityId||!d?.startsWith(decision.cityId+":")||!z.string().uuid().safeParse(d.slice(decision.cityId.length+1)).success||!one("i",decision.cityId))return null;}
  else if(!d?.startsWith("organizer:")||!z.string().uuid().safeParse(d.slice("organizer:".length)).success||tags.some(t=>t[0]==="i"))return null;
  if(!one("m",moderationKey(decision))||!one("status",decision.status)||!one("client","bitcoinwalk.org"))return null;
  return {event,decision};
 }catch{return null;}
}
export function latestEventModerations(records:EventModerationRecord[]){const seen=new Set<string>();return [...records].sort((a,b)=>compareEvents(a.event,b.event)).filter(r=>{const k=(r.decision.cityId??"global")+":"+moderationKey(r.decision);if(seen.has(k))return false;seen.add(k);return true;});}
export async function queryEventModerationsForCities(relays:string[],cityIds:string[]):Promise<EventModerationRecord[]>{
 const ids=[...new Set(cityIds)];if(!ids.length)return [];
 const events=await queryRelayEvents(relays,[EVENT_MODERATION_KIND],undefined,{authors:[SUPER_ADMIN_PUBKEY],"#i":ids});
 if(events.length>=500)throw new Error("Moderation history reached its safe read limit. No change may be signed.");
 const allowed=new Set(ids);return events.map(parseEventModeration).filter((r):r is EventModerationRecord=>!!r&&!!r.decision.cityId&&allowed.has(r.decision.cityId));
}
export async function queryEventModerations(relays:string[],cityId:string):Promise<EventModerationRecord[]>{
 return (await queryEventModerationsForCities(relays,[cityId])).filter(r=>r.decision.cityId===cityId);
}
export async function queryOrganizerModerations(relays:string[],target:string):Promise<EventModerationRecord[]>{
 if(!hex.safeParse(target).success)throw new Error("Enter the organizer's public npub, not a private key.");
 const events=await queryRelayEvents(relays,[EVENT_MODERATION_KIND],undefined,{authors:[SUPER_ADMIN_PUBKEY],"#m":[`organizer:${target}`,`author:${target}`]});
 if(events.length>=500)throw new Error("Organizer suspension history reached its safe read limit. No change may be signed.");
 const records=events.map(parseEventModeration).filter((r):r is EventModerationRecord=>!!r&&r.decision.target===target&&(r.decision.scope==="organizer"||r.decision.scope==="author"));
 if(events.length&&!records.length)throw new Error("Organizer suspension records failed signature or schema verification. Publishing is disabled until an administrator investigates.");
 return records;
}
export function latestOrganizerModeration(records:EventModerationRecord[],target:string):EventModerationRecord|undefined{
 const matching=[...records].filter(r=>r.decision.target===target&&(r.decision.scope==="organizer"||r.decision.scope==="author")).sort((a,b)=>compareEvents(a.event,b.event));
 return matching.find(r=>r.decision.scope==="organizer")??matching.find(r=>r.decision.scope==="author");
}
export async function organizerPublishingStatus(relays:string[],target:string):Promise<"active"|"suspended">{
 const record=latestOrganizerModeration(await queryOrganizerModerations(relays,target),target);
 return record?.decision.status==="suspended"?"suspended":"active";
}
export async function requireEventModerationRelay(relays:string[]){
 for(const relay of relays){const url=new URL(relay);url.protocol=url.protocol==="wss:"?"https:":"http:";const response=await fetch(url,{headers:{Accept:"application/nostr+json"},cache:"no-store",signal:AbortSignal.timeout(5000)});const info=response.ok?await response.json():null;const match=/^bitcoinwalk-organizers-0\.(\d+)\.(\d+)$/.exec(info?.version??"");if(!match||!(Number(match[1])>8||Number(match[1])===8&&Number(match[2])>=57))throw new Error("Global organizer suspension requires relay 0.8.57 or newer. Nothing signed.");}
}
