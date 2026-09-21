import {notFound,redirect} from "next/navigation";
import WalkEvent from "../../../components/walk-event";
import {directoryConfig} from "../../../lib/directory-config";
import {relayConfig} from "../../../lib/relay-config";
import {paidCityForSlug} from "../../../domain/event-routing";
import {resolveCalendarLink} from "../../../nostr/calendar-records";

export const dynamic="force-dynamic";

export default async function FreeTierEventPage({params}:{params:Promise<{city:string;event:string}>}) {
  const {city,event}=await params;
  if(!event.startsWith("nevent1"))notFound();
  const migrated=paidCityForSlug(city,directoryConfig.paidCities);
  if(migrated)redirect(`https://${migrated.slug}.bitcoinwalk.org/${event}`);
  let result;
  try{result=await resolveCalendarLink(event,relayConfig.readRelays);}catch{return <main><h1>Event temporarily unavailable</h1><p>The relay could not be read. Please try again later.</p></main>;}
  if(!result||result.walk.revision.city.slug!==city)notFound();
  return <WalkEvent event={result.event} walk={result.walk}/>;
}
