import type { Event } from "nostr-tools";
import CoordinatesCopy from "./coordinates-copy";
import WalkDelegation from "./walk-delegation";
import CalendarShare from "./calendar-share";
import { calendarNevent, calendarOccurrence, type CalendarWalk } from "../nostr/calendar-records";
import { relayConfig } from "../lib/relay-config";
import CityChat, {cityChatDetails} from "./city-chat";
import WalkWeather from "./walk-weather";

export default async function WalkEvent({event,walk}:{event:Event;walk:CalendarWalk}) {
  const city=walk.revision.city,occurrence=calendarOccurrence(event),point=occurrence?.meetingPoint??city.meetingPoint;
  const startSeconds=occurrence?.start??Math.floor(new Date(city.startAt).getTime()/1000),endSeconds=occurrence?.end??startSeconds+3600,start=startSeconds*1000;
  const chat=cityChatDetails({cityId:city.cityId,slug:city.slug});
  // nostr-tools caches verification on a symbol property. Explicitly copy the
  // signed wire fields before crossing the Server-to-Client boundary.
  const publicEvent:Event={kind:event.kind,id:event.id,pubkey:event.pubkey,created_at:event.created_at,tags:event.tags.map(tag=>[...tag]),content:event.content,sig:event.sig};
  return <main><p>BitcoinWalk / published event</p><h1>BitcoinWalk {city.cityName}</h1>
    <WalkWeather latitude={point.latitude} longitude={point.longitude} start={startSeconds} end={endSeconds} timeZone={occurrence?.timeZone??null} chatUrl={chat.url}/>
    {city.heroImageUrl&&<img className="hero-image" src={city.heroImageUrl} alt={`BitcoinWalk ${city.cityName}`}/>} 
    <p>{new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(occurrence?.timeZone?{timeZone:occurrence.timeZone}:{})}).format(new Date(start))}</p>
    <p style={{whiteSpace:"pre-wrap"}}>{city.description}</p><p>{point.description}</p>
    <CoordinatesCopy latitude={point.latitude} longitude={point.longitude}/>
    <WalkDelegation event={publicEvent} readOnly/>
    <CalendarShare nevent={calendarNevent(event,relayConfig.readRelays)}/>
    <CityChat cityId={city.cityId} slug={city.slug}/>
  </main>;
}
