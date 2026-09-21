import {headers} from "next/headers";
import {redirect} from "next/navigation";
import CityDirectory from "../components/city-directory";
import {currentOrNextEvent,paidCityForHost} from "../domain/event-routing";
import {directoryConfig} from "../lib/directory-config";
import {relayConfig} from "../lib/relay-config";
import {calendarNevent,loadCalendarWalks} from "../nostr/calendar-records";
import {queryCalendarEvents} from "../nostr/city-records";

export const dynamic="force-dynamic";

export default async function HomePage(){
  const paid=paidCityForHost((await headers()).get("host"),directoryConfig.paidCities);
  if(!paid)return <CityDirectory/>;
  let outcome: {state:"unavailable"}|{state:"missing"}|{state:"ready";cityName:string;eventHref?:string};
  try{
    const walks=await loadCalendarWalks(relayConfig.readRelays);
    const walk=walks.find(item=>item.revision.city.slug===paid.slug);
    if(!walk)outcome={state:"missing"};
    else{
      const events=await queryCalendarEvents(relayConfig.readRelays,{cityId:walk.revision.city.cityId});
      const event=currentOrNextEvent(walk,events);
      outcome={state:"ready",cityName:walk.revision.city.cityName,eventHref:event?`/${calendarNevent(event,relayConfig.readRelays)}`:undefined};
    }
  }catch{
    outcome={state:"unavailable"};
  }
  if(outcome.state==="unavailable")return <main><h1>Walk temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;
  if(outcome.state==="missing")return <main><h1>BitcoinWalk {paid.slug}</h1><p>This paid city is not currently approved.</p></main>;
  if(outcome.eventHref)redirect(outcome.eventHref);
  return <main><h1>BitcoinWalk {outcome.cityName}</h1><p>No upcoming walk has been scheduled.</p></main>;
}
