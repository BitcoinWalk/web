import type { Event } from "nostr-tools";
import Image from "next/image";
import CoordinatesCopy from "./coordinates-copy";
import WalkDelegation from "./walk-delegation";
import CalendarShare from "./calendar-share";
import { calendarContentImage,calendarImageOverride,calendarNevent, calendarOccurrence,calendarRoute,initialCalendarHero,retainedCalendarHero, type CalendarWalk, type CalendarSource } from "../nostr/calendar-records";
import { relayConfig } from "../lib/relay-config";
import CityChat from "./city-chat";
import WalkWeather, {WeatherAttribution} from "./walk-weather";
import {getWalkWeather} from "../domain/walk-weather";
import {pilotWeatherHero} from "../domain/weather-hero";
import CityPageLayout from "./city-page-layout";
import WalkDescriptions from "./walk-descriptions";
import WalkRoute from "./walk-route";
import type {LogoVariantAsset} from "../logos/catalog";
import {CityHostPanel} from "./public-city-host";
import {resolvePublicCityHost} from "../server/public-city-host";
import {resolvePublicCityPayment} from "../server/public-city-payment";
import SponsorModule from "./sponsor-module";
import {isLuganoSponsorEvent} from "../payments/lugano-event";
import type {SponsorshipPresentation} from "../domain/sponsorship";
import PublicCitySupport from "./public-city-support";
import type {ChatConfig} from "../domain/chat";
import styles from "./walk-event.module.css";

export default async function WalkEvent({event,walk,currentProfile,logoHref,titleLogo,sponsorship={state:"hidden"},sponsorPriceSats=21000,chatConfig,embedded=false}:{event:Event;walk:CalendarWalk;currentProfile:CalendarSource;logoHref?:string;titleLogo?:LogoVariantAsset;sponsorship?:SponsorshipPresentation;sponsorPriceSats?:number;chatConfig?:ChatConfig;embedded?:boolean}) {
  const city=walk.revision.city,occurrence=calendarOccurrence(event),point=occurrence?.meetingPoint??city.meetingPoint;
  const startSeconds=occurrence?.start??Math.floor(new Date(city.startAt).getTime()/1000),endSeconds=occurrence?.end??startSeconds+3600,start=startSeconds*1000;
  const [weather,host]=await Promise.all([
    getWalkWeather({latitude:point.latitude,longitude:point.longitude,start:startSeconds,end:endSeconds}),
    resolvePublicCityHost(city.cityId,currentProfile.revision.city.cityName,event.pubkey),
  ]);
  const forecastHero=pilotWeatherHero(city.slug,weather);
  // nostr-tools caches verification on a symbol property. Explicitly copy the
  // signed wire fields before crossing the Server-to-Client boundary.
  const publicEvent:Event={kind:event.kind,id:event.id,pubkey:event.pubkey,created_at:event.created_at,tags:event.tags.map(tag=>[...tag]),content:event.content,sig:event.sig};
  const timeZone=occurrence?.timeZone??undefined,date=new Date(start);
  const dateLabel=new Intl.DateTimeFormat(undefined,{dateStyle:"full",...(timeZone?{timeZone}:{})}).format(date);
  const timeLabel=new Intl.DateTimeFormat(undefined,{timeStyle:"short",...(timeZone?{timeZone}:{})}).format(date);
  return <CityPageLayout heroDescription={currentProfile.revision.city.description.split(/\n\s*\n/)[0]} cityName={city.cityName} titleLogo={titleLogo} embedded={embedded}
    headerExtra={<WalkWeather result={weather} timeZone={timeZone??null}/>}
    heroSources={[calendarImageOverride(event),forecastHero,city.heroImageUrl,walk.approval.approval.heroImageUrl,retainedCalendarHero(currentProfile),retainedCalendarHero(walk),initialCalendarHero(event,walk)]}
    summary={<>
        <div><span className={styles.eyebrow}>Next walk</span><time dateTime={date.toISOString()}><strong>{dateLabel}</strong><span>{timeLabel}</span></time></div>
        <div><span className={styles.eyebrow}>Meeting point</span><strong>{point.description}</strong><CoordinatesCopy latitude={point.latitude} longitude={point.longitude}/></div>
    </>}
    details={<>
        {host.state==="personal"&&<WalkDelegation event={publicEvent} readOnly/>}
        <CityHostPanel host={host} payment={await resolvePublicCityPayment(city.cityId,city.slug,host)} event={publicEvent}/>
        <PublicCitySupport cityId={currentProfile.revision.city.cityId} revisionId={currentProfile.revision.event.id} cityName={currentProfile.revision.city.cityName} requestedTier={currentProfile.revision.city.requestedTier}/>
        <CityChat cityId={city.cityId} slug={city.slug} config={chatConfig}/>
    </>}
    utilities={<><CalendarShare nevent={calendarNevent(event,relayConfig.calendarRelayHints)}/>
      {logoHref&&<p><a href={logoHref}>Download the official BitcoinWalk {city.cityName} logo pack</a></p>}
    </>}
    footer={weather.kind!=="past"&&<footer className="walk-event-footer"><WeatherAttribution/></footer>}>
    <WalkDescriptions cityName={currentProfile.revision.city.cityName} cityDescription={currentProfile.revision.city.description} eventDescription={event.content}/>
    {calendarContentImage(event)&&<figure className={styles.contentImage}><Image src={calendarContentImage(event)!} width={1600} height={900} sizes="(max-width: 960px) 100vw, 960px" unoptimized alt={`BitcoinWalk ${city.cityName} walk`}/></figure>}
    <div className={styles.sponsorshipSlot}><SponsorModule presentation={sponsorship} cityName={city.cityName} cityLogo={titleLogo} endsAt={endSeconds} luganoEvent={isLuganoSponsorEvent(city.slug,startSeconds)} priceSats={sponsorPriceSats}/></div>
    {calendarRoute(event)&&<WalkRoute url={calendarRoute(event)!}/>}
  </CityPageLayout>;
}
