import {type Event} from "nostr-tools";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {parseMediaRequest} from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {listSponsorLogoUploads,previewSponsorLogo} from "../../../../server/sponsor-logo-store";
import {loadCalendarWalks} from "../../../../nostr/calendar-records";
import {serverReadRelays} from "../../../../lib/server-relay-config";
import {bundledCityBackground,ensureShareImage,managedBackground,renderShareImage} from "../../../../server/share-image";
import {shareOrigin} from "../../../../server/share-preview";
import {shareBackgroundPosition} from "../../../../domain/hero-presentation";
import {getPaymentRuntime} from "../../../../payments/runtime";
import {getLogoCatalog} from "../../../../logos/runtime";
export const runtime="nodejs",dynamic="force-dynamic";
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 try{
  if(!request.body)return Response.json({error:"Authorization required."},{status:401,headers});
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>16384){await reader.cancel();return Response.json({error:"Request too large."},{status:413,headers});}chunks.push(value);}}finally{reader.releaseLock();}
  const body=JSON.parse(Buffer.concat(chunks).toString("utf8")) as {event?:Event;token?:string};
  const command=body.event&&parseMediaRequest(body.event);
  if(!body.event||!command)return Response.json({error:"Signed authorization required."},{status:403,headers});
  if(command.action==="generate-paid-sponsor-composite"){
   const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN,actor=body.event.pubkey;
   if(!origin||request.headers.get("origin")!==origin||actor!==command.sponsorPubkey||typeof body.token!=="string")return Response.json({error:"Paid sponsor authorization required."},{status:403,headers});
   try{getPaymentRuntime().sponsors.authorizeArtwork(command.orderId,body.token,actor,command.cityId);}catch{return Response.json({error:"Paid sponsor authorization required."},{status:403,headers});}
   const city=(await loadCalendarWalks(serverReadRelays())).find(row=>row.revision.city.cityId===command.cityId);if(!city)return Response.json({error:"Approved city unavailable."},{status:404,headers});
   const sponsor=Buffer.from((await previewSponsorLogo({cityId:command.cityId,sponsorPubkey:actor,hash:command.hash})).base64,"base64"),images=[city.approval.approval.heroImageUrl,city.revision.city.heroImageUrl],background=await managedBackground(images)??await bundledCityBackground(city.revision.city.slug);
   let cityLogo:Buffer|undefined;try{const catalog=getLogoCatalog(),pack=await catalog.readyForCity({cityId:command.cityId,slug:city.revision.city.slug});if(pack)cityLogo=(await catalog.file(pack.jobKey,`${pack.slug}-bitcoinwalk-on-black.png`))?.data;}catch{}
   const icon=await readFile(join(process.cwd(),"public","brand","bitcoinwalk-share-icon.png")),label=await readFile(join(process.cwd(),"public","brand","bitcoinwalk-powered-by.png")),image=await renderShareImage(background,icon,sponsor,label,cityLogo,shareBackgroundPosition(images)),hash=createHash("sha256").update(image).digest("hex"),slug=city.revision.city.slug.replace(/[^a-z0-9-]/g,"");
   return Response.json({base64:image.toString("base64"),hash,mime:"image/jpeg",width:1200,height:630,downloadName:`bitcoinwalk-${slug}-sponsor-og.jpg`},{headers});
  }
  if(!isSuperAdmin(body.event.pubkey)||!["list-sponsor-assets","preview-sponsor-asset","generate-sponsor-composite"].includes(command.action))return Response.json({error:"Signed super-admin authorization required."},{status:403,headers});
  if(command.action==="list-sponsor-assets")return Response.json({assets:await listSponsorLogoUploads()},{headers});
  if(command.action==="preview-sponsor-asset")return Response.json(await previewSponsorLogo(command),{headers});
  if(command.action==="generate-sponsor-composite"){
   const city=(await loadCalendarWalks(serverReadRelays())).find(row=>row.revision.city.cityId===command.targetCityId);if(!city)return Response.json({error:"Approved city unavailable."},{status:404,headers});
   const sponsor=Buffer.from((await previewSponsorLogo({cityId:command.sourceCityId,sponsorPubkey:command.sponsorPubkey,hash:command.hash})).base64,"base64");
   const images=[city.approval.approval.heroImageUrl,city.revision.city.heroImageUrl],background=await managedBackground(images)??await bundledCityBackground(city.revision.city.slug);
   const imageHash=await ensureShareImage(background,sponsor,undefined,shareBackgroundPosition(images));return Response.json({url:`${shareOrigin()}/api/og/files/${imageHash}.jpg`,hash:imageHash},{headers});
  }
  return Response.json({error:"Invalid action."},{status:403,headers});
 }catch{return Response.json({error:"Asset unavailable. Refresh the library and retry."},{status:400,headers});}
}
