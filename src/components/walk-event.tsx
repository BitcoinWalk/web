import type { Event } from "nostr-tools";
import CoordinatesCopy from "./coordinates-copy";
import CalendarShare from "./calendar-share";
import { calendarNevent, calendarOccurrence, type CalendarWalk } from "../nostr/calendar-records";
import { relayConfig } from "../lib/relay-config";

export default function WalkEvent({event,walk}:{event:Event;walk:CalendarWalk}) {
  const city=walk.revision.city,occurrence=calendarOccurrence(event),point=occurrence?.meetingPoint??city.meetingPoint;
  const start=(occurrence?.start??Math.floor(new Date(city.startAt).getTime()/1000))*1000;
  return <main><p>BitcoinWalk / published event</p><h1>BitcoinWalk {city.cityName}</h1>
    {city.heroImageUrl&&<img className="hero-image" src={city.heroImageUrl} alt={`BitcoinWalk ${city.cityName}`}/>} 
    <p>{new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(occurrence?.timeZone?{timeZone:occurrence.timeZone}:{})}).format(new Date(start))}</p>
    <p style={{whiteSpace:"pre-wrap"}}>{city.description}</p><p>{point.description}</p>
    <CoordinatesCopy latitude={point.latitude} longitude={point.longitude}/>
    <CalendarShare nevent={calendarNevent(event,relayConfig.readRelays)}/>
  </main>;
}
