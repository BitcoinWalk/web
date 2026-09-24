import type { Event } from "nostr-tools";
import type { CalendarWalk } from "../nostr/calendar-records";
import { calendarOccurrence, matchesCalendar, matchesInitialCalendar, matchesOrganizerCalendar } from "../nostr/calendar-records";
import type { PaidDirectoryCity } from "./directory";

export const WALK_REDIRECT_GRACE_SECONDS=60*60;
export type ManagedCalendarEvent={event:Event;start:number;end:number;timeZone:string|null;meetingPoint:{description:string;latitude:number;longitude:number};status:"active"|"grace"|"upcoming"|"past"};

export function paidCityForHost(host: string | null, paid: Record<string, PaidDirectoryCity>): PaidDirectoryCity | null {
  const hostname=(host??"").split(":")[0].toLowerCase();
  const match=/^([a-z0-9]+(?:-[a-z0-9]+)*)\.bitcoinwalk\.org$/.exec(hostname);
  if(!match)return null;
  return Object.values(paid).find(city=>city.subdomainReady&&city.slug===match[1])??null;
}

export function paidCityForSlug(slug:string,paid:Record<string,PaidDirectoryCity>):PaidDirectoryCity|null {
  return Object.values(paid).find(city=>city.subdomainReady&&city.slug===slug)??null;
}

export function eventPageHref(cityId:string,slug:string,nevent:string,paid:Record<string,PaidDirectoryCity>):string {
  const entitlement=Object.hasOwn(paid,cityId)?paid[cityId]:undefined;
  return entitlement?.subdomainReady&&entitlement.slug===slug
    ? `https://${slug}.bitcoinwalk.org/${nevent}`
    : `/${encodeURIComponent(slug)}/${nevent}`;
}

function routableOccurrence(walk:CalendarWalk,event:Event){
  const occurrence=calendarOccurrence(event);if(occurrence)return occurrence;
  if(!matchesCalendar(event,walk))return null;
  const starts=event.tags.filter(tag=>tag[0]==="start"&&tag.length===2),start=Number(starts[0]?.[1]);
  if(starts.length!==1||!Number.isSafeInteger(start)||start<0)return null;
  return {start,end:start+60*60,timeZone:null,meetingPoint:{...walk.revision.city.meetingPoint}};
}

/** Keep the active occurrence until its declared end, then rotate to the next.
 * Invalid, stale, foreign-city and unapproved events never enter the choice. */
export function currentOrNextEvent(walk:CalendarWalk,events:Event[],now=Math.floor(Date.now()/1000)):Event|null {
  if(!Number.isSafeInteger(now)||now<0)return null;
  const candidates=events.flatMap(event=>{
    if(!matchesCalendar(event,walk)&&!matchesOrganizerCalendar(event,walk)&&!matchesInitialCalendar(event,walk))return [];
    const occurrence=routableOccurrence(walk,event);
    if(!occurrence)return [];
    return [{event,start:occurrence.start,end:occurrence.end}];
  });
  const active=candidates.filter(item=>item.start<=now&&item.end+WALK_REDIRECT_GRACE_SECONDS>now).sort((a,b)=>b.start-a.start)[0];
  if(active)return active.event;
  return candidates.filter(item=>item.start>now).sort((a,b)=>a.start-b.start)[0]?.event??null;
}

export function managedCalendarEvents(walk:CalendarWalk,events:Event[],now=Math.floor(Date.now()/1000)):ManagedCalendarEvent[]{
  if(!Number.isSafeInteger(now)||now<0)return [];
  const rank={active:0,grace:1,upcoming:2,past:3};
  return events.flatMap(event=>{
    if(!matchesCalendar(event,walk)&&!matchesOrganizerCalendar(event,walk)&&!matchesInitialCalendar(event,walk))return [];
    const occurrence=routableOccurrence(walk,event);if(!occurrence)return [];
    const status=occurrence.start>now?"upcoming":occurrence.end>now?"active":occurrence.end+WALK_REDIRECT_GRACE_SECONDS>now?"grace":"past";
    return [{event,...occurrence,status} satisfies ManagedCalendarEvent];
  }).sort((a,b)=>rank[a.status]-rank[b.status]||(a.status==="past"?b.start-a.start:a.start-b.start));
}
