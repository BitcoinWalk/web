import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {directoryConfig} from "../../lib/directory-config";
import {relayConfig} from "../../lib/relay-config";
import {serverReadRelays} from "../../lib/server-relay-config";
import {currentOrNextEvent,paidCityForHost} from "../../domain/event-routing";
import {calendarNevent,loadCalendarWalks,resolveCalendarLink} from "../../nostr/calendar-records";
import {queryCalendarEvents} from "../../nostr/city-records";
import {contentRoute,queryContentRevisions} from "../../nostr/content-records";
import StaticContentPage from "../../components/static-content-page";
import {getLogoCatalog} from "../../logos/runtime";

export const dynamic="force-dynamic";

export default async function CityOrEventPage({params}:{params:Promise<{city:string}>}) {
  const {city}=await params;
  const paidHost=paidCityForHost((await headers()).get("host"),directoryConfig.paidCities);
  if(city.startsWith("nevent1")) {
    let result;
    try{result=await resolveCalendarLink(city,serverReadRelays());}catch{return <main><h1>Event temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;}
    if(!result||paidHost&&result.walk.revision.city.slug!==paidHost.slug)notFound();
    const eventCity=result.walk.revision.city;
    redirect(`https://bitcoinwalk.org/${encodeURIComponent(eventCity.slug)}/${city}`);
  }
  if(paidHost)redirect(`https://bitcoinwalk.org/${encodeURIComponent(paidHost.slug)}`);
  let staticRoute:ReturnType<typeof contentRoute>=null;
  try{staticRoute=contentRoute(await queryContentRevisions(serverReadRelays()),city);}catch{}
  if(staticRoute){if("redirect" in staticRoute)redirect(staticRoute.redirect);return <StaticContentPage page={staticRoute.page.page}/>;}
  let outcome: {state:"unavailable"}|{state:"missing"}|{state:"ready";cityName:string;eventHref?:string;logoHref?:string};
  try{
    const walks=await loadCalendarWalks(serverReadRelays());
    const walk=walks.find(item=>item.revision.city.slug===city);
    if(!walk)outcome={state:"missing"};
    else{
      const events=await queryCalendarEvents(serverReadRelays(),{cityId:walk.revision.city.cityId});
      const event=currentOrNextEvent(walk,events);
      let logoHref:string|undefined;try{const revision=walk.revision,pack=await getLogoCatalog().ready({cityId:revision.city.cityId,revisionId:revision.event.id,slug:revision.city.slug});if(pack?.publiclyListed)logoHref=`/${encodeURIComponent(pack.slug)}/logo`;}catch{}
      outcome={state:"ready",cityName:walk.revision.city.cityName,eventHref:event?`/${encodeURIComponent(city)}/${calendarNevent(event,relayConfig.calendarRelayHints)}`:undefined,logoHref};
    }
  }catch{
    outcome={state:"unavailable"};
  }
  if(outcome.state==="unavailable")return <main><h1>Walk temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;
  if(outcome.state==="missing")notFound();
  if(outcome.eventHref)redirect(outcome.eventHref);
  return <main><h1>BitcoinWalk {outcome.cityName}</h1><p>No upcoming walk has been scheduled.</p>{outcome.logoHref&&<p><Link href={outcome.logoHref}>Download the official city logo pack</Link></p>}<p><Link href="/">Browse BitcoinWalks</Link></p></main>;
}
