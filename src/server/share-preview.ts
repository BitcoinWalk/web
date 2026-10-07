import {cache} from "react";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import type {Metadata} from "next";
import {cityPreview,walkPreview} from "../domain/share-preview";
import {resolveCalendarLink,calendarOccurrence,initialCalendarHero,loadCalendarWalks} from "../nostr/calendar-records";
import {queryCalendarEvents} from "../nostr/city-records";
import {currentOrNextEvent} from "../domain/event-routing";
import {shareSponsor} from "./share-sponsor";
import {serverReadRelays} from "../lib/server-relay-config";
import {ensureShareImage,managedBackground,bundledCityBackground} from "./share-image";
import {getLogoCatalog} from "../logos/runtime";
import {shareBackgroundPosition} from "../domain/hero-presentation";
import {isManchesterBitfestCampaign,manchesterBitfestCityPreview,manchesterBitfestWalkPreview} from "../domain/share-campaign";
import {readSponsorLogoAsset} from "./sponsor-logo-store";
import {resolveCityRoute} from "../domain/city-route";
export function shareOrigin(){const url=new URL(process.env.BITCOINWALK_PUBLIC_ORIGIN||"https://app-staging.bitcoinwalk.org");if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error("Invalid public origin");return url.origin;}
export const resolveSharedWalk=cache((event:string)=>resolveCalendarLink(event,serverReadRelays()));
export const loadSharedCities=cache(()=>loadCalendarWalks(serverReadRelays()));
export function unavailableShare():Metadata{return {title:"BitcoinWalk | Walk unavailable",description:"This walk is not currently available.",robots:{index:false,follow:false},openGraph:{title:"BitcoinWalk | Walk unavailable",description:"This walk is not currently available.",images:[]},twitter:{card:"summary",title:"BitcoinWalk | Walk unavailable",description:"This walk is not currently available.",images:[]}};}
async function localizedLogo(cityId:string,slug:string):Promise<Buffer|null>{try{const catalog=getLogoCatalog(),pack=await catalog.readyForCity({cityId,slug});if(!pack)return null;return (await catalog.file(pack.jobKey,`${pack.slug}-bitcoinwalk-on-black.png`))?.data??null;}catch{return null;}}
async function renderedShareImage(cityId:string,slug:string,images:Array<string|null|undefined>,sponsor:Buffer|null):Promise<string>{const campaign=isManchesterBitfestCampaign(slug,images),background=campaign?await readFile(join(process.cwd(),"public","brand","campaigns","manchester-bitfest-background.webp")):await managedBackground(images)??await bundledCityBackground(slug),logo=campaign?await readFile(join(process.cwd(),"public","brand","campaigns","manchester-bitfest-lockup.png")):await localizedLogo(cityId,slug);return shareOrigin()+`/api/og/files/${await ensureShareImage(background,campaign?null:sponsor,logo??undefined,campaign?"centre":shareBackgroundPosition(images))}.jpg`;}
/** Caller supplies a logo hash from the resolved, current signed assignment. */
export async function assignedSponsorShareImage(cityId:string,slug:string,images:Array<string|null|undefined>,logoHash:string):Promise<string|undefined>{try{const sponsor=await readSponsorLogoAsset(logoHash);return sponsor?await renderedShareImage(cityId,slug,images,sponsor):undefined;}catch{return undefined;}}
async function metadata(text:{title:string;description:string},path:string,city:string,cityId:string,slug:string,images:Array<string|null|undefined>,sponsor:Buffer|null=null):Promise<Metadata>{
  const origin=shareOrigin(),url=origin+path;let image=origin+"/brand/bitcoinwalk-share-fallback.jpg";
  try{image=await renderedShareImage(cityId,slug,images,sponsor);}catch{}
  return {...text,alternates:{canonical:url},openGraph:{...text,type:"website",siteName:"BitcoinWalk",url,images:[{url:image,width:1200,height:630,type:"image/jpeg",alt:`BitcoinWalk ${city} — city artwork with the BitcoinWalk symbol`}]},twitter:{...text,card:"summary_large_image",images:[image]}};
}
export async function walkShareMetadata(city:string,event:string):Promise<Metadata>{try{
  const result=await resolveSharedWalk(event);if(!result)return unavailableShare();const route=resolveCityRoute([result.currentProfile],city);if(!route)return unavailableShare();
  const occurrence=calendarOccurrence(result.event);if(!occurrence)return unavailableShare();const current=result.currentProfile,images=[current.approval.approval.heroImageUrl,current.revision.city.heroImageUrl,initialCalendarHero(result.event,result.walk)],copy=isManchesterBitfestCampaign(current.revision.city.slug,images)?manchesterBitfestWalkPreview({...occurrence,meetingPoint:occurrence.meetingPoint.description}):walkPreview({city:result.walk.revision.city.cityName,...occurrence,meetingPoint:occurrence.meetingPoint.description});
  return await metadata(copy,`/${encodeURIComponent(route.canonicalSlug)}/${encodeURIComponent(event)}`,result.walk.revision.city.cityName,current.revision.city.cityId,current.revision.city.slug,images,await shareSponsor(current.revision.city.cityId,result.event));
}catch{return unavailableShare();}}
export async function cityShareMetadata(slug:string):Promise<Metadata>{try{
  const route=resolveCityRoute(await loadSharedCities(),slug),walk=route?.row;if(!walk||!route)return unavailableShare();const city=walk.revision.city,images=[walk.approval.approval.heroImageUrl,city.heroImageUrl],copy=isManchesterBitfestCampaign(city.slug,images)?manchesterBitfestCityPreview():cityPreview(city.cityName);
  let sponsor:Buffer|null=null;try{sponsor=await shareSponsor(city.cityId,currentOrNextEvent(walk,await queryCalendarEvents(serverReadRelays(),{cityId:city.cityId})));}catch{/* Unavailable coverage must not hide valid city metadata. */}
  return await metadata(copy,`/${encodeURIComponent(route.canonicalSlug)}`,city.cityName,city.cityId,city.slug,images,sponsor);
}catch{return unavailableShare();}}
