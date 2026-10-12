import type {Event} from "nostr-tools";
import {managedCalendarEvents,type ManagedCalendarEvent} from "../domain/event-routing";
import {calendarNevent,initialCalendarHero,loadCalendarWalks,type CalendarWalk} from "../nostr/calendar-records";
import {queryCalendarEvents} from "../nostr/city-records";
import {querySponsorships} from "../nostr/sponsorships";
import {relayConfig} from "../lib/relay-config";
import {serverReadRelays} from "../lib/server-relay-config";
import {publicSponsorship} from "./public-sponsorship";
import {readSponsorLogoAsset} from "./sponsor-logo-store";
import {renderedShareImage,shareOrigin} from "./share-preview";

export type PublicFutureEvent={
 id:string;
 name:string;
 description:string;
 startDate:string;
 endDate?:string;
 timeZone:string;
 link:string;
 venue?:string;
 address:string;
 latitude:number;
 longitude:number;
 image:string;
};

export type PublicEventsFeed={version:1;generatedAt:string;events:PublicFutureEvent[]};

function eventName(event:Event,walk:CalendarWalk):string{
 return event.tags.find(tag=>tag[0]==="title"&&tag.length===2)?.[1]??`BitcoinWalk ${walk.revision.city.cityName}`;
}

async function feedEvent(walk:CalendarWalk,item:ManagedCalendarEvent,sponsorships:Awaited<ReturnType<typeof querySponsorships>>,now:number):Promise<PublicFutureEvent>{
 const city=walk.revision.city,nevent=calendarNevent(item.event,relayConfig.calendarRelayHints),presentation=publicSponsorship(sponsorships,true,city.cityId,item.event,now,"og");
 const sponsor=presentation.state==="sponsor"&&presentation.logoHash?await readSponsorLogoAsset(presentation.logoHash):null;
 const image=await renderedShareImage(city.cityId,city.slug,[walk.approval.approval.heroImageUrl,city.heroImageUrl,initialCalendarHero(item.event,walk)],sponsor);
 return {
  id:item.event.id,
  name:eventName(item.event,walk),
  description:item.event.content.trim(),
  startDate:new Date(item.start*1000).toISOString(),
  endDate:new Date(item.end*1000).toISOString(),
  timeZone:item.timeZone??"UTC",
  link:`${shareOrigin()}/${encodeURIComponent(city.slug)}/${encodeURIComponent(nevent)}`,
  address:item.meetingPoint.description,
  latitude:item.meetingPoint.latitude,
  longitude:item.meetingPoint.longitude,
  image,
 };
}

/** Public, verified projection of current relay state. A read failure rejects the
 * whole feed so third parties never mistake a partial relay response for truth. */
export async function loadPublicEventsFeed(now=Math.floor(Date.now()/1000)):Promise<PublicEventsFeed>{
 if(!Number.isSafeInteger(now)||now<0)throw new Error("Invalid feed time.");
 const relays=serverReadRelays(),walks=await loadCalendarWalks(relays),cityIds=walks.map(walk=>walk.revision.city.cityId);
 if(!cityIds.length)return {version:1,generatedAt:new Date(now*1000).toISOString(),events:[]};
 const [events,sponsorships]=await Promise.all([queryCalendarEvents(relays,{cityIds}),querySponsorships(relays)]);
 if(events.length>=500)throw new Error("The future-event feed reached its safe relay read limit.");
 const selected=walks.flatMap(walk=>managedCalendarEvents(walk,events,now).filter(item=>item.status==="upcoming").map(item=>({walk,item})))
  .sort((a,b)=>a.item.start-b.item.start||a.walk.revision.city.cityName.localeCompare(b.walk.revision.city.cityName)||a.item.event.id.localeCompare(b.item.event.id));
 const seen=new Set<string>(),unique=selected.filter(row=>seen.has(row.item.event.id)?false:(seen.add(row.item.event.id),true));
 const result:PublicFutureEvent[]=[];
 for(const row of unique)result.push(await feedEvent(row.walk,row.item,sponsorships,now));
 return {version:1,generatedAt:new Date(now*1000).toISOString(),events:result};
}
