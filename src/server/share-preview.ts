import {cache} from "react";
import type {Metadata} from "next";
import {cityPreview,walkPreview} from "../domain/share-preview";
import {resolveCalendarLink,calendarOccurrence,initialCalendarHero,loadCalendarWalks} from "../nostr/calendar-records";
import {calendarAddress} from "../nostr/sponsorships";
import {shareSponsor} from "./share-sponsor";
import {serverReadRelays} from "../lib/server-relay-config";
import {ensureShareImage,managedBackground,bundledCityBackground} from "./share-image";
export function shareOrigin(){const url=new URL(process.env.BITCOINWALK_PUBLIC_ORIGIN||"https://app-staging.bitcoinwalk.org");if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error("Invalid public origin");return url.origin;}
export const resolveSharedWalk=cache((event:string)=>resolveCalendarLink(event,serverReadRelays()));
export const loadSharedCities=cache(()=>loadCalendarWalks(serverReadRelays()));
export function unavailableShare():Metadata{return {title:"BitcoinWalk | Walk unavailable",description:"This walk is not currently available.",robots:{index:false,follow:false},openGraph:{title:"BitcoinWalk | Walk unavailable",description:"This walk is not currently available.",images:[]},twitter:{card:"summary",title:"BitcoinWalk | Walk unavailable",description:"This walk is not currently available.",images:[]}};}
async function metadata(text:{title:string;description:string},path:string,city:string,images:Array<string|null|undefined>,sponsor:Buffer|null=null):Promise<Metadata>{
  const origin=shareOrigin(),url=origin+path;let image=origin+"/brand/bitcoinwalk-share-fallback.jpg";
  try{const background=await managedBackground(images)??await bundledCityBackground(path.split("/")[1]);image=origin+`/api/og/files/${await ensureShareImage(background,sponsor)}.jpg`;}catch{}
  return {...text,alternates:{canonical:url},openGraph:{...text,type:"website",siteName:"BitcoinWalk",url,images:[{url:image,width:1200,height:630,type:"image/jpeg",alt:`BitcoinWalk ${city} — city artwork with the BitcoinWalk symbol`}]},twitter:{...text,card:"summary_large_image",images:[image]}};
}
export async function walkShareMetadata(city:string,event:string):Promise<Metadata>{try{
  const result=await resolveSharedWalk(event);if(!result||result.walk.revision.city.slug!==city)return unavailableShare();
  const occurrence=calendarOccurrence(result.event);if(!occurrence)return unavailableShare();const current=result.currentProfile;
  return await metadata(walkPreview({city:result.walk.revision.city.cityName,...occurrence,meetingPoint:occurrence.meetingPoint.description}),`/${encodeURIComponent(city)}/${encodeURIComponent(event)}`,result.walk.revision.city.cityName,[current.approval.approval.heroImageUrl,current.revision.city.heroImageUrl,initialCalendarHero(result.event,result.walk)],await shareSponsor(current.revision.city.cityId,calendarAddress(result.event)));
}catch{return unavailableShare();}}
export async function cityShareMetadata(slug:string):Promise<Metadata>{try{
  const walk=(await loadSharedCities()).find(row=>row.revision.city.slug===slug);if(!walk)return unavailableShare();const city=walk.revision.city;
  return await metadata(cityPreview(city.cityName),`/${encodeURIComponent(slug)}`,city.cityName,[walk.approval.approval.heroImageUrl,city.heroImageUrl],await shareSponsor(city.cityId));
}catch{return unavailableShare();}}
