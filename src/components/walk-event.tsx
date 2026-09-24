import type { Event } from "nostr-tools";
import CoordinatesCopy from "./coordinates-copy";
import WalkDelegation from "./walk-delegation";
import CalendarShare from "./calendar-share";
import { calendarNevent, calendarOccurrence, type CalendarWalk } from "../nostr/calendar-records";
import { relayConfig } from "../lib/relay-config";
import CityChat, {cityChatDetails} from "./city-chat";
import WalkWeather from "./walk-weather";
import {getWalkWeather} from "../domain/walk-weather";
import {pilotWeatherHero} from "../domain/weather-hero";

export default async function WalkEvent({event,walk}:{event:Event;walk:CalendarWalk}) {
  const city=walk.revision.city,occurrence=calendarOccurrence(event),point=occurrence?.meetingPoint??city.meetingPoint;
  const startSeconds=occurrence?.start??Math.floor(new Date(city.startAt).getTime()/1000),endSeconds=occurrence?.end??startSeconds+3600,start=startSeconds*1000;
  const chat=cityChatDetails({cityId:city.cityId,slug:city.slug});
  const weather=await getWalkWeather({latitude:point.latitude,longitude:point.longitude,start:startSeconds,end:endSeconds});
  const forecastHero=pilotWeatherHero(city.slug,weather),hero=forecastHero??city.heroImageUrl;
  // nostr-tools caches verification on a symbol property. Explicitly copy the
  // signed wire fields before crossing the Server-to-Client boundary.
  const publicEvent:Event={kind:event.kind,id:event.id,pubkey:event.pubkey,created_at:event.created_at,tags:event.tags.map(tag=>[...tag]),content:event.content,sig:event.sig};
  return <main><p>BitcoinWalk / published event</p><h1>BitcoinWalk {city.cityName}</h1>
    <WalkWeather result={weather} timeZone={occurrence?.timeZone??null} chatUrl={chat.url}/>
    {hero&&<figure className="event-hero"><img className="hero-image" src={hero} alt={`BitcoinWalk ${city.cityName}`}/>{forecastHero&&<figcaption>Forecast-inspired view for this walk · not a live camera</figcaption>}</figure>}
    <p>{new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(occurrence?.timeZone?{timeZone:occurrence.timeZone}:{})}).format(new Date(start))}</p>
    <p style={{whiteSpace:"pre-wrap"}}>{city.description}</p><p>{point.description}</p>
    <CoordinatesCopy latitude={point.latitude} longitude={point.longitude}/>
    <WalkDelegation event={publicEvent} readOnly/>
    <CalendarShare nevent={calendarNevent(event,relayConfig.readRelays)}/>
    <CityChat cityId={city.cityId} slug={city.slug}/>
  </main>;
}
