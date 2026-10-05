import type {Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {cityLogoVariants} from "../../../../logos/inkscape-source";
import {getLogoRuntime} from "../../../../logos/runtime";

export const dynamic="force-dynamic",runtime="nodejs";

export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 try{
  const body=await request.json() as {event?:Event},command=body.event&&parseMediaRequest(body.event);
  if(!body.event||!command||command.action!=="prepare-city-logo"||!isSuperAdmin(body.event.pubkey))return Response.json({error:"Signed super-admin authorization required."},{status:403,headers});
  const candidate=await getLogoRuntime().service.preparePending(command.cityId,command.revisionId,command.slug);
  return Response.json({status:"ready",jobKey:candidate.jobKey,files:cityLogoVariants.length},{headers});
 }catch(error){
  const message=error instanceof Error?error.message:"Localized logos could not be created.";
  const status=message.includes("busy")?429:message.includes("pending new-city")||message.includes("changed while")?409:400;
  return Response.json({error:message},{status,headers});
 }
}
