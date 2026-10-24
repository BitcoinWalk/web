import {type Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {listSponsorLogoUploads,previewSponsorLogo} from "../../../../server/sponsor-logo-store";
import {loadCalendarWalks} from "../../../../nostr/calendar-records";
import {serverReadRelays} from "../../../../lib/server-relay-config";
import {renderedShareImage} from "../../../../server/share-preview";
import {paidSponsorLinkPreview} from "../../../../server/paid-sponsor-preview";
import {getPaymentRuntime} from "../../../../payments/runtime";
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
   let order;try{order=getPaymentRuntime().sponsors.authorizeArtwork(command.orderId,body.token,actor,command.cityId);}catch{return Response.json({error:"Paid sponsor authorization required."},{status:403,headers});}
   const result=await paidSponsorLinkPreview(order,actor,command.hash);if(!result)return Response.json({error:"Your payment and logo are saved. BitcoinWalk needs to restore this booking’s city setup before your share image can be created. Contact BitcoinWalk with your order number; you do not need to pay or upload again.",code:"SPONSOR_CITY_UNAVAILABLE",orderId:command.orderId},{status:409,headers});
   return Response.json(result,{headers});
  }
  if(!isSuperAdmin(body.event.pubkey)||!["list-sponsor-assets","preview-sponsor-asset","generate-sponsor-composite"].includes(command.action))return Response.json({error:"Signed super-admin authorization required."},{status:403,headers});
  if(command.action==="list-sponsor-assets")return Response.json({assets:await listSponsorLogoUploads()},{headers});
  if(command.action==="preview-sponsor-asset")return Response.json(await previewSponsorLogo(command),{headers});
  if(command.action==="generate-sponsor-composite"){
   const city=(await loadCalendarWalks(serverReadRelays())).find(row=>row.revision.city.cityId===command.targetCityId);if(!city)return Response.json({error:"Approved city unavailable."},{status:404,headers});
   const sponsor=Buffer.from((await previewSponsorLogo({cityId:command.sourceCityId,sponsorPubkey:command.sponsorPubkey,hash:command.hash})).base64,"base64");
   const images=[city.approval.approval.heroImageUrl,city.revision.city.heroImageUrl];
   const url=await renderedShareImage(command.targetCityId,city.revision.city.slug,images,sponsor),hash=/\/([a-f0-9]{64})\.jpg$/.exec(url)?.[1];
   return Response.json({url,hash},{headers});
  }
  return Response.json({error:"Invalid action."},{status:403,headers});
 }catch{return Response.json({error:"Asset unavailable. Refresh the library and retry."},{status:400,headers});}
}
