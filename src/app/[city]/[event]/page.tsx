import {notFound,redirect} from "next/navigation";
import WalkEvent from "../../../components/walk-event";
import {cityWalkTitleLogoVariant} from "../../../components/city-walk-title";
import {serverReadRelays} from "../../../lib/server-relay-config";
import {assignedSponsorShareImage,resolveSharedWalk,walkShareMetadata} from "../../../server/share-preview";
import {getLogoCatalog} from "../../../logos/runtime";
import {logoVariantAsset,type LogoVariantAsset} from "../../../logos/catalog";
import {resolvedFeatureFlags} from "../../../nostr/feature-flags";
import {querySponsorships} from "../../../nostr/sponsorships";
import {publicSponsorship} from "../../../server/public-sponsorship";
import {DEFAULT_FEATURE_FLAGS} from "../../../domain/feature-flags";
import {initialCalendarHero} from "../../../nostr/calendar-records";
import {resolveCityRoute} from "../../../domain/city-route";

export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{city:string;event:string}>}){const {city,event}=await params;return walkShareMetadata(city,event);}

export default async function FreeTierEventPage({params}:{params:Promise<{city:string;event:string}>}) {
  const {city,event}=await params;
  if(!event.startsWith("nevent1"))notFound();
  let result;
  try{result=await resolveSharedWalk(event);}catch{return <main><h1>Event temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;}
  if(!result)notFound();
  const route=resolveCityRoute([result.currentProfile],city);if(!route)notFound();
  if(route.redirect)redirect(`/${encodeURIComponent(route.canonicalSlug)}/${encodeURIComponent(event)}`);
  const [featureFlagResult,sponsorshipResult]=await Promise.allSettled([resolvedFeatureFlags(serverReadRelays()),querySponsorships(serverReadRelays())]),featureFlags=featureFlagResult.status==="fulfilled"?featureFlagResult.value:DEFAULT_FEATURE_FLAGS,sponsorshipRows=sponsorshipResult.status==="fulfilled"?sponsorshipResult.value:[];
  let logoHref:string|undefined,titleLogo:LogoVariantAsset|undefined;try{const revision=result.walk.revision,pack=await getLogoCatalog().readyForCity({cityId:revision.city.cityId,slug:revision.city.slug});if(pack){titleLogo=logoVariantAsset(pack,cityWalkTitleLogoVariant)??undefined;if(pack.publiclyListed)logoHref=`/${encodeURIComponent(pack.slug)}/logo`;}}catch{}
  const sponsorship=publicSponsorship(sponsorshipRows,featureFlags.sponsorships&&sponsorshipResult.status==="fulfilled",result.walk.revision.city.cityId,result.event);
  const current=result.currentProfile,cityProfile=current.revision.city,sponsorOgImage=sponsorship.state==="sponsor"&&sponsorship.logoHash?await assignedSponsorShareImage(cityProfile.cityId,cityProfile.slug,[current.approval.approval.heroImageUrl,cityProfile.heroImageUrl,initialCalendarHero(result.event,result.walk)],sponsorship.logoHash):undefined;
  return <WalkEvent event={result.event} walk={result.walk} currentProfile={result.currentProfile} logoHref={logoHref} titleLogo={titleLogo} sponsorship={sponsorship} sponsorOgImage={sponsorOgImage}/>;
}
