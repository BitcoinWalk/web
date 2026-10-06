import {calendarEventSource,calendarOccurrence,loadCalendarWalks} from "../nostr/calendar-records";
import {queryCalendarEvents} from "../nostr/city-records";
import {calendarAddress,querySponsorships,resolveSponsorship} from "../nostr/sponsorships";
import {resolvedFeatureFlags} from "../nostr/feature-flags";
import {serverReadRelays} from "../lib/server-relay-config";
import {sponsorCoverage} from "../domain/sponsor-coverage";
import type {SponsorCity,SponsorWalk} from "./sponsor-types";
export async function sponsorshipCatalog():Promise<SponsorCity[]>{
 const relays=serverReadRelays();if(!(await resolvedFeatureFlags(relays)).sponsorships)throw new Error("Sponsorship booking is currently unavailable.");
 const orders=process.env.BITCOINWALK_PAYMENT_DATABASE?(await import("./runtime")).getPaymentRuntime().sponsors.list():[];
 const [cities,assignments]=await Promise.all([loadCalendarWalks(relays),querySponsorships(relays)]);
 const events=await queryCalendarEvents(relays,{cityIds:cities.map(c=>c.revision.city.cityId)});
 return cities.map(city=>{const profile=city.revision.city,walks:SponsorWalk[]=[],seen=new Set<string>();for(const event of events){const occurrence=calendarOccurrence(event),address=calendarAddress(event);if(!occurrence||!address||seen.has(address)||occurrence.start<=Date.now()/1000+3600||!calendarEventSource(event,city)||sponsorCoverage(resolveSponsorship(assignments,true,profile.cityId,address,occurrence.start),orders,profile.cityId,{id:event.id,address,start:occurrence.start,end:occurrence.end},occurrence.start).state!=="empty")continue;seen.add(address);walks.push({id:event.id,address,start:occurrence.start,label:new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",timeZone:occurrence.timeZone??"UTC"}).format(occurrence.start*1000)+` · ${occurrence.timeZone??"UTC"} · ${occurrence.meetingPoint.description}`});}return {id:profile.cityId,name:profile.cityName,slug:profile.slug,walks:walks.sort((a,b)=>a.start-b.start)};});
}
