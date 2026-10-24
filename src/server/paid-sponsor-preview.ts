import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {nip19} from "nostr-tools";
import type {SponsorOrder} from "../payments/sponsor-types";
import {calendarEventSource,calendarOccurrence,initialCalendarHero,loadCalendarWalks} from "../nostr/calendar-records";
import {queryCalendarEvents} from "../nostr/city-records";
import {serverReadRelays} from "../lib/server-relay-config";
import {shareBackgroundPosition} from "../domain/hero-presentation";
import {bundledCityBackground,managedBackground,renderShareImage} from "./share-image";
import {previewSponsorLogo} from "./sponsor-logo-store";
import {shareOrigin,walkShareCopy} from "./share-preview";

export async function paidSponsorLinkPreview(order:SponsorOrder,sponsorPubkey:string,logoHash:string){
 const relays=serverReadRelays(),cities=await loadCalendarWalks(relays),comparable=(value:string)=>value.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim(),related=cities.filter(row=>row.revision.city.cityId===order.cityId||comparable(row.revision.city.cityName)===comparable(order.cityName)),city=cities.find(row=>row.revision.city.cityId===order.cityId)??(related.length===1?related[0]:undefined);if(!city)return null;
 const eventId=order.walks[0]?.id,event=eventId?(await queryCalendarEvents(relays,{ids:[eventId]})).find(item=>item.id===eventId):undefined,sources=event?related.filter(row=>calendarEventSource(event,row)):[],source=sources.length===1?sources[0]:undefined,occurrence=event&&source&&calendarOccurrence(event);if(!event||!source||!occurrence)return null;
 const images=[city.approval.approval.heroImageUrl,city.revision.city.heroImageUrl,initialCalendarHero(event,source)];
 const sponsor=Buffer.from((await previewSponsorLogo({cityId:order.cityId,sponsorPubkey,hash:logoHash})).base64,"base64"),background=await managedBackground(images)??await bundledCityBackground(city.revision.city.slug),icon=await readFile(join(process.cwd(),"public","brand","bitcoinwalk-share-icon.png")),label=await readFile(join(process.cwd(),"public","brand","bitcoinwalk-powered-by.png")),image=await renderShareImage(background,icon,sponsor,label,undefined,shareBackgroundPosition(images)),hash=createHash("sha256").update(image).digest("hex"),slug=city.revision.city.slug.replace(/[^a-z0-9-]/g,"");
 const nevent=nip19.neventEncode({id:event.id,author:event.pubkey,kind:event.kind}),copy=walkShareCopy(city.revision.city.cityName,slug,images,occurrence),preview={url:`${shareOrigin()}/${encodeURIComponent(slug)}/${encodeURIComponent(nevent)}`,title:copy.title,description:copy.description,siteName:"bitcoinwalk.org"};
 return {base64:image.toString("base64"),hash,mime:"image/jpeg" as const,width:1200 as const,height:630 as const,downloadName:`bitcoinwalk-${slug}-sponsor-og.jpg`,preview};
}
