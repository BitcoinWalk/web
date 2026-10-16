import {createHash} from "node:crypto";
import type {Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {queryCityAuthorization} from "../../../../nostr/city-records";
import {canEditCity} from "../../../../nostr/organizer-edit";
import {serverReadRelays} from "../../../../lib/server-relay-config";
import {storeWalkImage} from "../../../../server/media-store";

export const dynamic="force-dynamic",runtime="nodejs";

export async function POST(request:Request){
 try{
  const declared=Number(request.headers.get("content-length")||0);if(declared>5.5*1024*1024)return Response.json({error:"Walk images must be 5 MB or smaller."},{status:413});
  const form=await request.formData(),raw=form.get("event"),file=form.get("file");if(typeof raw!=="string"||!(file instanceof File))return Response.json({error:"Signed image upload required."},{status:401});
  const event=JSON.parse(raw) as Event,command=parseMediaRequest(event);if(!command||command.action!=="upload-walk-image")return Response.json({error:"Invalid or expired image authorization."},{status:401});
  const grant=await queryCityAuthorization(serverReadRelays(),command.cityId);if(!isSuperAdmin(event.pubkey)&&(!grant||!canEditCity(event.pubkey,grant.grant)))return Response.json({error:"This identity cannot manage images for that city."},{status:403});
  if(file.size!==command.bytes||file.type!==command.mime||file.size>5*1024*1024)return Response.json({error:"The selected file does not match the signed upload."},{status:400});
  const bytes=Buffer.from(await file.arrayBuffer()),hash=createHash("sha256").update(bytes).digest("hex");if(hash!==command.sha256)return Response.json({error:"The selected file changed before upload."},{status:400});
  const origin=(process.env.BITCOINWALK_MEDIA_PUBLIC_ORIGIN||new URL(request.url).origin).replace(/\/$/,"");if(!origin.startsWith("https://"))throw new Error("Media public origin must use HTTPS.");
  const record=await storeWalkImage({cityId:command.cityId,actor:event.pubkey,bytes,mime:command.mime,origin});return Response.json({url:record.internalUrl,hash:record.contentHash},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Image upload failed."},{status:400,headers:{"Cache-Control":"no-store"}});}
}
