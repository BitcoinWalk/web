import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {directoryConfig} from "../../lib/directory-config";
import {relayConfig} from "../../lib/relay-config";
import {serverReadRelays} from "../../lib/server-relay-config";
import {currentOrNextEvent,paidCityForHost} from "../../domain/event-routing";
import {calendarNevent,resolveCalendarLink} from "../../nostr/calendar-records";
import {queryCalendarEvents} from "../../nostr/city-records";
import {contentRoute,queryContentRevisions} from "../../nostr/content-records";
import StaticContentPage from "../../components/static-content-page";
import {getLogoCatalog} from "../../logos/runtime";
import SponsorModule from "../../components/sponsor-module";
import type {SponsorshipPresentation} from "../../domain/sponsorship";
import {resolvedFeatureFlags} from "../../nostr/feature-flags";
import {querySponsorships} from "../../nostr/sponsorships";
import {publicSponsorship} from "../../server/public-sponsorship";
import {DEFAULT_FEATURE_FLAGS} from "../../domain/feature-flags";
import {assignedSponsorShareImage,cityShareMetadata,loadSharedCities} from "../../server/share-preview";
import {previewText} from "../../domain/share-preview";
import {resolveCityRoute} from "../../domain/city-route";

export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{city:string}>}) {
  const {city}=await params;
  if(city.startsWith("nevent1"))return {};
  try {
    const route=contentRoute(await queryContentRevisions(serverReadRelays()),city);
    if(route)return "page" in route?{title:previewText(route.page.page.title,65),description:previewText(route.page.page.intro,160)}:{};
  }catch{return {};}
  return cityShareMetadata(city);
}

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
  let outcome: {state:"unavailable"}|{state:"missing"}|{state:"redirect";href:string}|{state:"ready";cityName:string;eventHref?:string;logoHref?:string;sponsorship:SponsorshipPresentation;sponsorOgImage?:string};
  try{
    const walks=await loadSharedCities(),[flagResult,sponsorshipResult]=await Promise.allSettled([resolvedFeatureFlags(serverReadRelays()),querySponsorships(serverReadRelays())]),flags=flagResult.status==="fulfilled"?flagResult.value:DEFAULT_FEATURE_FLAGS,sponsorships=sponsorshipResult.status==="fulfilled"?sponsorshipResult.value:[];
    const route=resolveCityRoute(walks,city);
    if(!route)outcome={state:"missing"};
    else if(route.redirect)outcome={state:"redirect",href:`/${encodeURIComponent(route.canonicalSlug)}`};
    else{
      const walk=route.row;
      const events=await queryCalendarEvents(serverReadRelays(),{cityId:walk.revision.city.cityId});
      const event=currentOrNextEvent(walk,events);
      let logoHref:string|undefined;try{const revision=walk.revision,pack=await getLogoCatalog().ready({cityId:revision.city.cityId,revisionId:revision.event.id,slug:revision.city.slug});if(pack?.publiclyListed)logoHref=`/${encodeURIComponent(pack.slug)}/logo`;}catch{}
      const profile=walk.revision.city,sponsorship=publicSponsorship(sponsorships,flags.sponsorships&&sponsorshipResult.status==="fulfilled",profile.cityId,event),sponsorOgImage=sponsorship.state==="sponsor"&&sponsorship.logoHash?await assignedSponsorShareImage(profile.cityId,profile.slug,[walk.approval.approval.heroImageUrl,profile.heroImageUrl],sponsorship.logoHash):undefined;
      outcome={state:"ready",cityName:profile.cityName,eventHref:event?`/${encodeURIComponent(profile.slug)}/${calendarNevent(event,relayConfig.calendarRelayHints)}`:undefined,logoHref,sponsorship,sponsorOgImage};
    }
  }catch{
    outcome={state:"unavailable"};
  }
  if(outcome.state==="unavailable")return <main><h1>Walk temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;
  if(outcome.state==="missing")notFound();
  if(outcome.state==="redirect")redirect(outcome.href);
  if(outcome.eventHref)redirect(outcome.eventHref);
  return <main><h1>BitcoinWalk {outcome.cityName}</h1><p>No upcoming walk has been scheduled.</p><SponsorModule presentation={outcome.sponsorship} cityName={outcome.cityName} ogImageUrl={outcome.sponsorOgImage}/>{outcome.logoHref&&<p><Link href={outcome.logoHref}>Download the official city logo pack</Link></p>}<p><Link href="/">Browse BitcoinWalks</Link></p></main>;
}
