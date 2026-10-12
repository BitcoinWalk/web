import {calendarNevent,initialCalendarHero,approvedCalendarWalks} from "../nostr/calendar-records";
import {queryCalendarEvents,queryDirectoryRecords} from "../nostr/city-records";
import {resolvedFeatureFlags} from "../nostr/feature-flags";
import {calendarAddress,querySponsorships} from "../nostr/sponsorships";
import {managedCalendarEvents} from "../domain/event-routing";
import type {HomeSponsoredWalk} from "../domain/home-sponsored-walks";
import {relayConfig} from "../lib/relay-config";
import {serverReadRelays} from "../lib/server-relay-config";
import {publicSponsorship} from "./public-sponsorship";
import {assignedSponsorShareImage,renderedShareImage} from "./share-preview";

const MAX_SPONSORED_WALKS=50;

/** Public homepage data assembled from the same signed assignment, settled
 * order, approved-logo and current-city checks used by walk metadata. */
export async function loadHomeSponsoredWalks(now=Math.floor(Date.now()/1000)):Promise<HomeSponsoredWalk[]>{
 if(!Number.isSafeInteger(now)||now<0)return [];
 try{
  const relays=serverReadRelays();
  const [flags,directory,events,sponsorships]=await Promise.all([
   resolvedFeatureFlags(relays),queryDirectoryRecords(relays),queryCalendarEvents(relays),querySponsorships(relays),
  ]);
  if(!flags.featuredCityWalks||events.length>=500)return [];
  const walks=approvedCalendarWalks(directory.revisions,directory.approvals),cards:HomeSponsoredWalk[]=[];
  for(const walk of walks){
   const city=walk.revision.city,seen=new Set<string>();
   for(const item of managedCalendarEvents(walk,events,now)){
    if(item.status!=="upcoming")continue;
    const address=calendarAddress(item.event);
    if(!address||seen.has(address))continue;seen.add(address);
    const sponsor=publicSponsorship(sponsorships,true,city.cityId,item.event,now,"og");
    if(sponsor.state!=="sponsor"||!sponsor.logoHash)continue;
    const images=[walk.approval.approval.heroImageUrl,city.heroImageUrl,initialCalendarHero(item.event,walk)];
    const sponsored=await assignedSponsorShareImage(city.cityId,city.slug,images,sponsor.logoHash);
    let imageUrl=sponsored;
    if(!imageUrl)try{imageUrl=await renderedShareImage(city.cityId,city.slug,images,null);}catch{}
    cards.push({cityId:city.cityId,cityName:city.cityName,eventId:item.event.id,href:`/${encodeURIComponent(city.slug)}/${calendarNevent(item.event,relayConfig.calendarRelayHints)}`,...(imageUrl?{imageUrl}:{}),meetingPoint:item.meetingPoint.description,sponsorPubkey:sponsor.pubkey,start:item.start,timeZone:item.timeZone});
   }
  }
  return cards.sort((a,b)=>a.start-b.start||a.cityName.localeCompare(b.cityName)||a.eventId.localeCompare(b.eventId)).slice(0,MAX_SPONSORED_WALKS);
 }catch{return [];}
}
