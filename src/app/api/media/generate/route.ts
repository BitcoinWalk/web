import {type Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {queryDirectoryRecords} from "../../../../nostr/city-records";
import {serverReadRelays} from "../../../../lib/server-relay-config";
import {OpenAIImageGenerator} from "../../../../server/image-generator";
import {assertGenerationBudget,storeGeneratedCityImage} from "../../../../server/media-store";
export const dynamic="force-dynamic",runtime="nodejs";
let generating=false;
export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event},command=body.event?parseMediaRequest(body.event):null;
  if(!body.event||!isSuperAdmin(body.event.pubkey)||!command||command.action!=="generate-city-image")return Response.json({error:"Super-admin authorization required."},{status:403});
  if(generating)return Response.json({error:"Another image is being generated. Try again shortly."},{status:429});
  const {revisions}=await queryDirectoryRecords(serverReadRelays()),revision=revisions.find(item=>item.event.id===command.cityRevisionId&&item.city.cityId===command.cityId);
  if(!revision)return Response.json({error:"The signed city revision could not be verified."},{status:404});
  const origin=(process.env.BITCOINWALK_MEDIA_PUBLIC_ORIGIN||new URL(request.url).origin).replace(/\/$/,"");if(!origin.startsWith("https://"))throw new Error("Media public origin must use HTTPS.");
  await assertGenerationBudget(body.event.pubkey);generating=true;try{const generated=await new OpenAIImageGenerator().generateCityHero({cityName:revision.city.cityName,latitude:revision.city.meetingPoint.latitude,longitude:revision.city.meetingPoint.longitude,meetingPoint:revision.city.meetingPoint.description}),record=await storeGeneratedCityImage({cityId:command.cityId,actor:body.event.pubkey,bytes:generated.bytes,model:generated.model,origin});return Response.json({url:record.internalUrl,hash:record.contentHash,model:generated.model},{headers:{"Cache-Control":"no-store"}});}finally{generating=false;}
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Image generation failed."},{status:400,headers:{"Cache-Control":"no-store"}});}
}
