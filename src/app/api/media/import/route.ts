import {type Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {queryCityAuthorization} from "../../../../nostr/city-records";
import {canEditCity} from "../../../../nostr/organizer-edit";
import {serverReadRelays} from "../../../../lib/server-relay-config";
import {importCityImage} from "../../../../server/media-store";
export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){try{const body=await request.json() as {event?:Event};if(!body.event)return Response.json({error:"Signed authorization required."},{status:401});const command=parseMediaRequest(body.event);if(!command||command.action!=="import-city-image")return Response.json({error:"Invalid or expired media authorization."},{status:401});const grant=await queryCityAuthorization(serverReadRelays(),command.cityId);if(!isSuperAdmin(body.event.pubkey)&&(!grant||!canEditCity(body.event.pubkey,grant.grant)))return Response.json({error:"This identity cannot manage images for that city."},{status:403});const origin=process.env.BITCOINWALK_MEDIA_PUBLIC_ORIGIN||new URL(request.url).origin;if(!origin.startsWith("https://"))throw new Error("Media public origin must use HTTPS.");const record=await importCityImage({cityId:command.cityId,actor:body.event.pubkey,sourceUrl:command.sourceUrl,origin:origin.replace(/\/$/,"")});return Response.json({url:record.internalUrl,hash:record.contentHash},{headers:{"Cache-Control":"no-store"}});}catch(error){return Response.json({error:error instanceof Error?error.message:"Image import failed."},{status:400,headers:{"Cache-Control":"no-store"}});}}
