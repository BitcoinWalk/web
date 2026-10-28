import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {directoryConfig} from "../../lib/directory-config";
import {relayConfig} from "../../lib/relay-config";
import {serverReadRelays} from "../../lib/server-relay-config";
import {currentOrNextEventAcrossSources,paidCityForHost} from "../../domain/event-routing";
import {calendarNevent,resolveCalendarLink,retainedCalendarHero,type CalendarSource} from "../../nostr/calendar-records";
import {queryCalendarEvents} from "../../nostr/city-records";
import {contentRoute,queryContentRevisions} from "../../nostr/content-records";
import StaticContentPage from "../../components/static-content-page";
import {getLogoCatalog} from "../../logos/runtime";
import {logoVariantAsset,type LogoVariantAsset} from "../../logos/catalog";
import {cityWalkTitleLogoVariant} from "../../components/city-walk-title";
import CityPageLayout from "../../components/city-page-layout";
import CoordinatesCopy from "../../components/coordinates-copy";
import WalkDescriptions from "../../components/walk-descriptions";
import styles from "../../components/walk-event.module.css";
import SponsorModule from "../../components/sponsor-module";
import type {SponsorshipPresentation} from "../../domain/sponsorship";
import {resolvedFeatureFlags} from "../../nostr/feature-flags";
import {querySponsorships} from "../../nostr/sponsorships";
import {publicSponsorship} from "../../server/public-sponsorship";
import {DEFAULT_FEATURE_FLAGS} from "../../domain/feature-flags";
import {cityShareMetadata,loadSharedCities} from "../../server/share-preview";
import {previewText} from "../../domain/share-preview";
import {cityRouteFamily,resolveCityRoute} from "../../domain/city-route";
import PublicCityHost from "../../components/public-city-host";
import PublicCitySupport from "../../components/public-city-support";
import CityChat from "../../components/city-chat";
import {serverChatConfig} from "../../server/chat-config";

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

export default async function CityOrEventPage({params,searchParams}:{params:Promise<{city:string}>;searchParams:Promise<{view?:string|string[]}>}) {
  const {city}=await params;
  const embedded=(await searchParams).view==="app";
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
  let outcome: {state:"unavailable"}|{state:"missing"}|{state:"redirect";href:string}|{state:"ready";profile:CalendarSource;cityId:string;cityName:string;slug:string;revisionId:string;requestedTier?:"free"|"paid";eventHref?:string;logoHref?:string;titleLogo?:LogoVariantAsset;sponsorship:SponsorshipPresentation};
  try{
    const walks=await loadSharedCities(),[flagResult,sponsorshipResult]=await Promise.allSettled([resolvedFeatureFlags(serverReadRelays()),querySponsorships(serverReadRelays())]),flags=flagResult.status==="fulfilled"?flagResult.value:DEFAULT_FEATURE_FLAGS,sponsorships=sponsorshipResult.status==="fulfilled"?sponsorshipResult.value:[];
    const route=resolveCityRoute(walks,city);
    if(!route)outcome={state:"missing"};
    else if(route.redirect)outcome={state:"redirect",href:`/${encodeURIComponent(route.canonicalSlug)}`};
    else{
      const walk=route.row,routeFamily=cityRouteFamily(walks,walk);
      const events=await queryCalendarEvents(serverReadRelays(),{cityIds:routeFamily.map(row=>row.revision.city.cityId)});
      const event=currentOrNextEventAcrossSources(routeFamily,events);
      let logoHref:string|undefined,titleLogo:LogoVariantAsset|undefined;try{const revision=walk.revision,pack=await getLogoCatalog().readyForCity({cityId:revision.city.cityId,slug:revision.city.slug});if(pack){titleLogo=logoVariantAsset(pack,cityWalkTitleLogoVariant)??undefined;if(pack.publiclyListed)logoHref=`/${encodeURIComponent(pack.slug)}/logo`;}}catch{}
      const profile=walk.revision.city,sponsorship=publicSponsorship(sponsorships,flags.sponsorships&&sponsorshipResult.status==="fulfilled",profile.cityId,event);
      outcome={state:"ready",profile:walk,cityId:profile.cityId,cityName:profile.cityName,slug:profile.slug,revisionId:walk.revision.event.id,requestedTier:profile.requestedTier,eventHref:event?`/${encodeURIComponent(profile.slug)}/${calendarNevent(event,relayConfig.calendarRelayHints)}`:undefined,logoHref,titleLogo,sponsorship};
    }
  }catch{
    outcome={state:"unavailable"};
  }
  if(outcome.state==="unavailable")return <main><h1>Walk temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;
  if(outcome.state==="missing")notFound();
  if(outcome.state==="redirect")redirect(`${outcome.href}${embedded?"?view=app":""}`);
  if(outcome.eventHref)redirect(`${outcome.eventHref}${embedded?"?view=app":""}`);
  const profile=outcome.profile.revision.city,point=profile.meetingPoint;
  return <CityPageLayout heroDescription={profile.description.split(/\n\s*\n/)[0]} cityName={outcome.cityName} titleLogo={outcome.titleLogo} embedded={embedded}
    heroSources={[profile.heroImageUrl,outcome.profile.approval.approval.heroImageUrl,retainedCalendarHero(outcome.profile)]}
    summary={<>
      <div><span className={styles.eyebrow}>Next walk</span><strong>No upcoming walk has been scheduled.</strong><p>Explore the city community while the next walk is being planned.</p></div>
      <div><span className={styles.eyebrow}>Meeting point</span><strong>{point.description}</strong><CoordinatesCopy latitude={point.latitude} longitude={point.longitude}/></div>
    </>}
    details={<>
      <PublicCityHost cityId={outcome.cityId} cityName={outcome.cityName} citySlug={outcome.slug}/>
      <PublicCitySupport cityId={outcome.cityId} revisionId={outcome.revisionId} cityName={outcome.cityName} requestedTier={outcome.requestedTier}/>
      <CityChat cityId={outcome.cityId} slug={outcome.slug} config={serverChatConfig()}/>
    </>}
    utilities={<>{outcome.logoHref&&<p><Link href={outcome.logoHref}>Download the official city logo pack</Link></p>}<p><Link href="/">Browse BitcoinWalks</Link></p></>}>
    <WalkDescriptions cityName={outcome.cityName} cityDescription={profile.description} eventDescription={profile.description}/>
    <div className={styles.sponsorshipSlot}><SponsorModule presentation={outcome.sponsorship} cityName={outcome.cityName} cityLogo={outcome.titleLogo}/></div>
  </CityPageLayout>;
}
