import {verifyEvent,type Event} from "nostr-tools";
import {queryRelayEvents} from "./city-records";
import {ACCEPTANCE_KIND,DELEGATION_KIND,delegationState} from "./delegations";
import {loadCalendarWalks,matchesCalendar,matchesInitialCalendar,matchesOrganizerCalendar,type CalendarWalk} from "./calendar-records";
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
 if(!ids.length)return result;
 const events:Event[]=[];
 for(let offset=0;offset<ids.length;offset+=100)events.push(...await queryRelayEvents(relays,[31923],undefined,{ids:ids.slice(offset,offset+100),limit:100}));
 const walks=await loadCalendarWalks(relays);
 const resolved=events.flatMap(event=>{const walk=walks.find(candidate=>matchesCalendar(event,candidate)||matchesOrganizerCalendar(event,candidate)||matchesInitialCalendar(event,candidate));return walk?[{event,walk}]:[];});
 const walkIds=resolved.map(entry=>entry.event.id),controls:Event[]=[];
 for(let offset=0;offset<walkIds.length;offset+=100)controls.push(...await queryRelayEvents(relays,[DELEGATION_KIND],undefined,{"#e":walkIds.slice(offset,offset+100),limit:500}));
 const invitationIds=controls.map(event=>event.id),acceptances:Event[]=[];
 for(let offset=0;offset<invitationIds.length;offset+=100)acceptances.push(...await queryRelayEvents(relays,[ACCEPTANCE_KIND],undefined,{"#e":invitationIds.slice(offset,offset+100),limit:500}));
 for(const {event,walk} of resolved){
  const current=delegationState(event,[...controls,...acceptances]);
  if(current?.status!=="accepted"||current.control.nomineePubkey!==actor)continue;
  const item=managedCalendarEvents(walk,[event])[0];
  if(item)result.push({walk,item});
 }
 return result.sort((a,b)=>a.item.start-b.item.start||a.item.event.id.localeCompare(b.item.event.id));
}
