import {type Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {auditMedia} from "../../../../server/media-store";
export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){try{const body=await request.json() as {event?:Event};if(!body.event||!isSuperAdmin(body.event.pubkey)||parseMediaRequest(body.event)?.action!=="list-media-alerts")return Response.json({error:"Super-admin authorization required."},{status:403});return Response.json({alerts:await auditMedia(),checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});}catch(error){return Response.json({error:error instanceof Error?error.message:"Media audit failed."},{status:400});}}
