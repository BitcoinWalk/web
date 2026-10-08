import type { Event } from "nostr-tools";
import CoordinatesCopy from "./coordinates-copy";
import WalkDelegation from "./walk-delegation";
import CalendarShare from "./calendar-share";
import { calendarImageOverride,calendarNevent, calendarOccurrence,calendarRoute,initialCalendarHero, type CalendarWalk, type CalendarSource } from "../nostr/calendar-records";
import { relayConfig } from "../lib/relay-config";
import CityChat, {cityChatDetails} from "./city-chat";
import WalkWeather from "./walk-weather";
import {getWalkWeather} from "../domain/walk-weather";
import {pilotWeatherHero} from "../domain/weather-hero";
import ResilientHero from "./resilient-hero";
import WalkDescriptions from "./walk-descriptions";
import WalkRoute from "./walk-route";
import CityWalkTitle from "./city-walk-title";
import type {LogoVariantAsset} from "../logos/catalog";
import {CityHostPanel} from "./public-city-host";
import {resolvePublicCityHost} from "../server/public-city-host";
import SponsorModule from "./sponsor-module";
import type {SponsorshipPresentation} from "../domain/sponsorship";

export default async function WalkEvent({event,walk,currentProfile,logoHref,titleLogo,sponsorship={state:"hidden"},sponsorOgImage}:{event:Event;walk:CalendarWalk;currentProfile:CalendarSource;logoHref?:string;titleLogo?:LogoVariantAsset;sponsorship?:SponsorshipPresentation;sponsorOgImage?:string}) {
  const city=walk.revision.city,occurrence=calendarOccurrence(event),point=occurrence?.meetingPoint??city.meetingPoint;
  const startSeconds=occurrence?.start??Math.floor(new Date(city.startAt).getTime()/1000),endSeconds=occurrence?.end??startSeconds+3600,start=startSeconds*1000;
  const chat=cityChatDetails({cityId:city.cityId,slug:city.slug});
  const [weather,host]=await Promise.all([
    getWalkWeather({latitude:point.latitude,longitude:point.longitude,start:startSeconds,end:endSeconds}),
    resolvePublicCityHost(city.cityId,currentProfile.revision.city.cityName,event.pubkey),
  ]);
  const forecastHero=pilotWeatherHero(city.slug,weather);
  // nostr-tools caches verification on a symbol property. Explicitly copy the
  // signed wire fields before crossing the Server-to-Client boundary.
  const publicEvent:Event={kind:event.kind,id:event.id,pubkey:event.pubkey,created_at:event.created_at,tags:event.tags.map(tag=>[...tag]),content:event.content,sig:event.sig};
  return <main><CityWalkTitle cityName={city.cityName} logo={titleLogo}/>
    <WalkWeather result={weather} timeZone={occurrence?.timeZone??null} chatUrl={chat.url}/>
    <ResilientHero sources={[calendarImageOverride(event),forecastHero,city.heroImageUrl,walk.approval.approval.heroImageUrl,initialCalendarHero(event,walk)]} alt={`BitcoinWalk ${city.cityName}`} forecast={!calendarImageOverride(event)&&!!forecastHero}/>
    <p>{new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(occurrence?.timeZone?{timeZone:occurrence.timeZone}:{})}).format(new Date(start))}</p>
    <WalkDescriptions cityName={currentProfile.revision.city.cityName} cityDescription={currentProfile.revision.city.description} eventDescription={event.content}/><p>{point.description}</p>
    {calendarRoute(event)&&<WalkRoute url={calendarRoute(event)!}/>}
    <CoordinatesCopy latitude={point.latitude} longitude={point.longitude}/>
    {host.state==="personal"&&<WalkDelegation event={publicEvent} readOnly/>}
    <CityHostPanel host={host}/>
    <SponsorModule presentation={sponsorship} cityName={city.cityName} ogImageUrl={sponsorOgImage} endsAt={endSeconds}/>
    <CalendarShare nevent={calendarNevent(event,relayConfig.calendarRelayHints)}/>
    <CityChat cityId={city.cityId} slug={city.slug}/>
    {logoHref&&<p><a href={logoHref}>Download the official BitcoinWalk {city.cityName} logo pack</a></p>}
  </main>;
}
