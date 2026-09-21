import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import WalkEvent from "../../components/walk-event";
import {directoryConfig} from "../../lib/directory-config";
import {relayConfig} from "../../lib/relay-config";
import {serverReadRelays} from "../../lib/server-relay-config";
import {currentOrNextEvent,paidCityForHost,paidCityForSlug} from "../../domain/event-routing";
import {calendarNevent,loadCalendarWalks,resolveCalendarLink} from "../../nostr/calendar-records";
import {queryCalendarEvents} from "../../nostr/city-records";

export const dynamic="force-dynamic";

export default async function CityOrEventPage({params}:{params:Promise<{city:string}>}) {
  const {city}=await params;
  const paidHost=paidCityForHost((await headers()).get("host"),directoryConfig.paidCities);
  if(city.startsWith("nevent1")) {
    let result;
    try{result=await resolveCalendarLink(city,serverReadRelays());}catch{return <main><h1>Event temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;}
    if(!result||paidHost&&result.walk.revision.city.slug!==paidHost.slug)notFound();
    if(!paidHost){
      const eventCity=result.walk.revision.city;
      const migratedEvent=paidCityForSlug(eventCity.slug,directoryConfig.paidCities);
      if(migratedEvent)redirect(`https://${migratedEvent.slug}.bitcoinwalk.org/${city}`);
      redirect(`/${encodeURIComponent(eventCity.slug)}/${city}`);
    }
    return <WalkEvent event={result.event} walk={result.walk}/>;
  }
  const migrated=paidCityForSlug(city,directoryConfig.paidCities);
  if(migrated)redirect(`https://${migrated.slug}.bitcoinwalk.org`);
  if(paidHost)notFound();
  let outcome: {state:"unavailable"}|{state:"missing"}|{state:"ready";cityName:string;eventHref?:string};
  try{
    const walks=await loadCalendarWalks(serverReadRelays());
    const walk=walks.find(item=>item.revision.city.slug===city);
    if(!walk)outcome={state:"missing"};
    else{
      const events=await queryCalendarEvents(serverReadRelays(),{cityId:walk.revision.city.cityId});
      const event=currentOrNextEvent(walk,events);
      outcome={state:"ready",cityName:walk.revision.city.cityName,eventHref:event?`/${encodeURIComponent(city)}/${calendarNevent(event,relayConfig.readRelays)}`:undefined};
    }
  }catch{
    outcome={state:"unavailable"};
  }
  if(outcome.state==="unavailable")return <main><h1>Walk temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;
  if(outcome.state==="missing")notFound();
  if(outcome.eventHref)redirect(outcome.eventHref);
  return <main><h1>BitcoinWalk {outcome.cityName}</h1><p>No upcoming walk has been scheduled.</p><p><Link href="/">Browse BitcoinWalks</Link></p></main>;
}
