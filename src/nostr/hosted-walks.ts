import {nip19,verifyEvent,type Event} from "nostr-tools";
import {queryRelayEvents} from "./city-records";
import {ACCEPTANCE_KIND,queryDelegation} from "./delegations";
import {resolveCalendarLink,type CalendarWalk} from "./calendar-records";
import {managedCalendarEvents,type ManagedCalendarEvent} from "../domain/event-routing";

export type HostedWalk={walk:CalendarWalk;item:ManagedCalendarEvent};
// Acceptance history discovers candidates only. The latest authoritative
// delegation and the public event are re-read before showing a hosting role.
export function acceptedWalkIds(events:Event[],actor:string):string[]{
 const ids=new Set<string>();
 for(const event of events){
  if(event.kind!==ACCEPTANCE_KIND||event.pubkey!==actor||!verifyEvent(event))continue;
  try{const c=JSON.parse(event.content);if(c.version===2&&/^[0-9a-f]{64}$/.test(c.eventId)&&event.tags.some(t=>t.length===2&&t[0]==="walk"&&t[1]===c.eventId))ids.add(c.eventId);}catch{}
 }
 return [...ids];
}
export async function queryHostedWalks(relays:string[],actor:string):Promise<HostedWalk[]>{
 if(!/^[0-9a-f]{64}$/.test(actor))throw new Error("Connect a valid Nostr identity.");
 const history=await queryRelayEvents(relays,[ACCEPTANCE_KIND],undefined,{authors:[actor],limit:200});
 if(history.length>=200)throw new Error("Hosting history reached the safe read limit. Ask an administrator to review it; this is not an empty hosting list.");
 const ids=acceptedWalkIds(history,actor),result:HostedWalk[]=[];
 // Bound concurrent reads so a busy organizer doesn't flood the relay.
 for(let offset=0;offset<ids.length;offset+=4){
  const batch=await Promise.all(ids.slice(offset,offset+4).map(async id=>{
   const resolved=await resolveCalendarLink(nip19.neventEncode({id,kind:31923}),relays);
   if(!resolved)return null; // cancelled, archived or no longer public
   const current=await queryDelegation(relays,resolved.event);
   if(current?.status!=="accepted"||current.control.nomineePubkey!==actor)return null;
   const item=managedCalendarEvents(resolved.walk,[resolved.event])[0];
   return item?{walk:resolved.walk,item}:null;
  }));
  for(const entry of batch)if(entry)result.push(entry);
 }
 return result.sort((a,b)=>a.item.start-b.item.start||a.item.event.id.localeCompare(b.item.event.id));
}
