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
 const relays=serverReadRelays(),city=(await loadCalendarWalks(relays)).find(row=>row.revision.city.cityId===order.cityId);if(!city)return null;
 const eventId=order.walks[0]?.id,event=eventId?(await queryCalendarEvents(relays,{ids:[eventId]})).find(item=>item.id===eventId&&calendarEventSource(item,city)):undefined,occurrence=event&&calendarOccurrence(event),images=[city.approval.approval.heroImageUrl,city.revision.city.heroImageUrl,event&&initialCalendarHero(event,city)];
 const sponsor=Buffer.from((await previewSponsorLogo({cityId:order.cityId,sponsorPubkey,hash:logoHash})).base64,"base64"),background=await managedBackground(images)??await bundledCityBackground(city.revision.city.slug),icon=await readFile(join(process.cwd(),"public","brand","bitcoinwalk-share-icon.png")),label=await readFile(join(process.cwd(),"public","brand","bitcoinwalk-powered-by.png")),image=await renderShareImage(background,icon,sponsor,label,undefined,shareBackgroundPosition(images)),hash=createHash("sha256").update(image).digest("hex"),slug=city.revision.city.slug.replace(/[^a-z0-9-]/g,"");
 const nevent=event&&nip19.neventEncode({id:event.id,author:event.pubkey,kind:event.kind}),copy=occurrence?walkShareCopy(city.revision.city.cityName,slug,images,occurrence):null,preview=nevent&&copy?{url:`${shareOrigin()}/${encodeURIComponent(slug)}/${encodeURIComponent(nevent)}`,title:copy.title,description:copy.description,siteName:"bitcoinwalk.org"}:null;
 return {base64:image.toString("base64"),hash,mime:"image/jpeg" as const,width:1200 as const,height:630 as const,downloadName:`bitcoinwalk-${slug}-sponsor-og.jpg`,preview};
}
