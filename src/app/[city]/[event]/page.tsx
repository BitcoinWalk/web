import {notFound} from "next/navigation";
import WalkEvent from "../../../components/walk-event";
import {cityWalkTitleLogoVariant} from "../../../components/city-walk-title";
import {serverReadRelays} from "../../../lib/server-relay-config";
import {resolveCalendarLink} from "../../../nostr/calendar-records";
import {getLogoCatalog} from "../../../logos/runtime";
import {logoVariantAsset,type LogoVariantAsset} from "../../../logos/catalog";
import {resolvedFeatureFlags} from "../../../nostr/feature-flags";
import {calendarAddress,querySponsorships,resolveSponsorship} from "../../../nostr/sponsorships";
import {DEFAULT_FEATURE_FLAGS} from "../../../domain/feature-flags";

export const dynamic="force-dynamic";

export default async function FreeTierEventPage({params}:{params:Promise<{city:string;event:string}>}) {
  const {city,event}=await params;
  if(!event.startsWith("nevent1"))notFound();
  let result;
  try{result=await resolveCalendarLink(event,serverReadRelays());}catch{return <main><h1>Event temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;}
  if(!result||result.walk.revision.city.slug!==city)notFound();
  const [featureFlagResult,sponsorshipResult]=await Promise.allSettled([resolvedFeatureFlags(serverReadRelays()),querySponsorships(serverReadRelays())]),featureFlags=featureFlagResult.status==="fulfilled"?featureFlagResult.value:DEFAULT_FEATURE_FLAGS,sponsorshipRows=sponsorshipResult.status==="fulfilled"?sponsorshipResult.value:[];
  let logoHref:string|undefined,titleLogo:LogoVariantAsset|undefined;try{const revision=result.walk.revision,pack=await getLogoCatalog().readyForCity({cityId:revision.city.cityId,slug:revision.city.slug});if(pack){titleLogo=logoVariantAsset(pack,cityWalkTitleLogoVariant)??undefined;if(pack.publiclyListed)logoHref=`/${encodeURIComponent(pack.slug)}/logo`;}}catch{}
  const sponsorship=resolveSponsorship(sponsorshipRows,featureFlags.sponsorships,result.walk.revision.city.cityId,calendarAddress(result.event));
  return <WalkEvent event={result.event} walk={result.walk} currentProfile={result.currentProfile} logoHref={logoHref} titleLogo={titleLogo} sponsorship={sponsorship}/>;
}
