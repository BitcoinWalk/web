import {notFound} from "next/navigation";
import WalkEvent from "../../../components/walk-event";
import {cityWalkTitleLogoVariant} from "../../../components/city-walk-title";
import {serverReadRelays} from "../../../lib/server-relay-config";
import {resolveCalendarLink} from "../../../nostr/calendar-records";
import {getLogoCatalog} from "../../../logos/runtime";
import {logoVariantAsset,type LogoVariantAsset} from "../../../logos/catalog";

export const dynamic="force-dynamic";

export default async function FreeTierEventPage({params}:{params:Promise<{city:string;event:string}>}) {
  const {city,event}=await params;
  if(!event.startsWith("nevent1"))notFound();
  let result;
  try{result=await resolveCalendarLink(event,serverReadRelays());}catch{return <main><h1>Event temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;}
  if(!result||result.walk.revision.city.slug!==city)notFound();
  let logoHref:string|undefined,titleLogo:LogoVariantAsset|undefined;try{const revision=result.walk.revision,pack=await getLogoCatalog().readyForCity({cityId:revision.city.cityId,slug:revision.city.slug});if(pack){titleLogo=logoVariantAsset(pack,cityWalkTitleLogoVariant)??undefined;if(pack.publiclyListed)logoHref=`/${encodeURIComponent(pack.slug)}/logo`;}}catch{}
  return <WalkEvent event={result.event} walk={result.walk} currentProfile={result.currentProfile} logoHref={logoHref} titleLogo={titleLogo}/>;
}
