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
  try{
    const walks=await loadCalendarWalks(relayConfig.readRelays);
    const walk=walks.find(item=>item.revision.city.slug===paid.slug);
    if(!walk)return <main><h1>BitcoinWalk {paid.slug}</h1><p>This paid city is not currently approved.</p></main>;
    const events=await queryCalendarEvents(relayConfig.readRelays,{cityId:walk.revision.city.cityId});
    const event=currentOrNextEvent(walk,events);
    if(event)redirect(`/${calendarNevent(event,relayConfig.readRelays)}`);
    return <main><h1>BitcoinWalk {walk.revision.city.cityName}</h1><p>No upcoming walk has been scheduled.</p></main>;
  }catch(error){
    if(error&&typeof error==="object"&&"digest" in error)throw error;
    return <main><h1>Walk temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;
  }
}
