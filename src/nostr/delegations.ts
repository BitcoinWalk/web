import {z} from "zod";
import {compareEvents,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {isSuperAdmin,SUPER_ADMIN_PUBKEY} from "./authority";
import {queryRelayEvents} from "./city-records";
export const DELEGATION_KIND=30305, ACCEPTANCE_KIND=30306;
const key=z.string().regex(/^[0-9a-f]{64}$/);
const schema=z.object({version:z.literal(2),cityId:z.string().uuid(),eventId:key,nomineePubkey:key,action:z.enum(["invite","revoke"]),previousId:z.union([key,z.literal("")]),expiresAt:z.number().int().nonnegative()}).strict();
export type Delegation={event:Event;control:z.infer<typeof schema>;status:"pending"|"accepted"|"expired"|"revoked";acceptance?:Event};
const nowSeconds=()=>Math.floor(Date.now()/1000);
export function walkCity(event:Event){return event.tags.find(t=>t[0]==="i")?.[1]??"";}
export function walkEnd(event:Event){return Number(event.tags.find(t=>t[0]==="end")?.[1]??event.tags.find(t=>t[0]==="start")?.[1]??0);}
export function canDelegateWalk(actor:string,walk:Event){return actor===walk.pubkey||isSuperAdmin(actor);}
function tagsMatch(event:Event,expected:Record<string,string>){return event.tags.length===Object.keys(expected).length&&Object.entries(expected).every(([name,value])=>event.tags.filter(t=>t[0]===name).length===1&&event.tags.some(t=>t.length===2&&t[0]===name&&t[1]===value));}
export function delegationState(walk:Event,events:Event[],now=nowSeconds()):Delegation|undefined{
 for(const event of [...events].sort(compareEvents)){
  if(event.kind!==DELEGATION_KIND||event.created_at>now+60||!verifyEvent(event)||!canDelegateWalk(event.pubkey,walk))continue;
  let parsed;try{parsed=schema.safeParse(JSON.parse(event.content));}catch{continue;}if(!parsed.success)continue;
  const c=parsed.data,d=event.tags.find(t=>t[0]==="d")?.[1]??"";
  if(c.eventId!==walk.id||c.cityId!==walkCity(walk)||c.nomineePubkey===walk.pubkey||!d.startsWith(c.cityId+":")||!z.string().uuid().safeParse(d.slice(c.cityId.length+1)).success||!tagsMatch(event,{d,i:c.cityId,e:walk.id,p:c.nomineePubkey,action:c.action}))continue;
  if(c.action==="invite"&&(c.expiresAt<=event.created_at||c.expiresAt>event.created_at+7*86400||c.expiresAt>walkEnd(walk))||c.action==="revoke"&&c.expiresAt!==0)continue;
  const acceptance=events.find(a=>{
   if(a.kind!==ACCEPTANCE_KIND||a.pubkey!==c.nomineePubkey||a.created_at<event.created_at||a.created_at>c.expiresAt||a.created_at>now+60||!verifyEvent(a)||!tagsMatch(a,{d:event.id,i:c.cityId,e:event.id,walk:walk.id}))return false;
   try{const data=JSON.parse(a.content);return JSON.stringify(Object.keys(data).sort())===JSON.stringify(["cityId","eventId","invitationId","version"])&&data.version===2&&data.cityId===c.cityId&&data.eventId===walk.id&&data.invitationId===event.id;}catch{return false;}
  });
  return {event,control:c,acceptance,status:c.action==="revoke"?"revoked":acceptance?"accepted":now>c.expiresAt?"expired":"pending"};
 }
}
export function delegationControl(walk:Event,actor:string,nominee:string,action:"invite"|"revoke",previous:Delegation|undefined,now=nowSeconds()):EventTemplate{
 if(!canDelegateWalk(actor,walk))throw new Error("Only the walk author or super-admin can delegate this walk.");
 key.parse(nominee);if(nominee===walk.pubkey)throw new Error("Choose a colleague instead of the original walk author.");
 if(previous&&previous.control.eventId!==walk.id)throw new Error("Wrong walk. Refresh before signing.");
 if(previous&&now<=previous.event.created_at)throw new Error("Please wait a second and try again.");
 if(action==="revoke"&&(!previous||previous.control.nomineePubkey!==nominee))throw new Error("No matching delegation to revoke.");
 const expiresAt=action==="invite"?Math.min(now+7*86400,walkEnd(walk)):0;
 if(action==="invite"&&expiresAt<=now)throw new Error("This walk has already ended.");
 const control={version:2,cityId:walkCity(walk),eventId:walk.id,nomineePubkey:nominee,action,previousId:previous?.event.id??"",expiresAt};
 return {kind:DELEGATION_KIND,created_at:now,tags:[["d",control.cityId+":"+crypto.randomUUID()],["i",control.cityId],["e",walk.id],["p",nominee],["action",action]],content:JSON.stringify(control)};
}
export function delegationAcceptance(invite:Delegation,actor:string,now=nowSeconds()):EventTemplate{
 if(invite.status!=="pending"||now>invite.control.expiresAt)throw new Error("This invitation is no longer available.");
 if(actor!==invite.control.nomineePubkey)throw new Error("Select the Nostr identity named in this invitation.");
 return {kind:ACCEPTANCE_KIND,created_at:now,tags:[["d",invite.event.id],["i",invite.control.cityId],["e",invite.event.id],["walk",invite.control.eventId]],content:JSON.stringify({version:2,cityId:invite.control.cityId,eventId:invite.control.eventId,invitationId:invite.event.id})};
}
export async function queryDelegation(relays:string[],walk:Event):Promise<Delegation|undefined>{
 const events=await queryRelayEvents(relays,[DELEGATION_KIND],undefined,{"#e":[walk.id],authors:[walk.pubkey,SUPER_ADMIN_PUBKEY],limit:200});
 if(events.length>=200)throw new Error("Delegation history reached its safe read limit. Ask an administrator to review it.");
 const current=delegationState(walk,events);
 if(!current||current.control.action!=="invite")return current;
 const accepted=await queryRelayEvents(relays,[ACCEPTANCE_KIND],undefined,{authors:[current.control.nomineePubkey],"#e":[current.event.id],limit:10});
 return delegationState(walk,[...events,...accepted]);
}
export async function requireDelegationRelay(relays:string[]){
 for(const relay of relays){const url=new URL(relay);url.protocol=url.protocol==="ws:"?"http:":"https:";const r=await fetch(url,{headers:{Accept:"application/nostr+json"},cache:"no-store",signal:AbortSignal.timeout(5000)});if(!r.ok||(await r.json()).version!=="bitcoinwalk-organizers-0.7.1")throw new Error("Single-walk delegation is not enabled on this relay yet.");}
}
