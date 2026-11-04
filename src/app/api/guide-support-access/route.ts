import type {Event} from "nostr-tools";
import {parseMediaRequest} from "../../../domain/media-request";
import {isGuideRequester} from "../../../server/replication-status-auth";
import {guideSupportPlan} from "../../../server/guide-support-access";

export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event};
  if(!body.event||!isGuideRequester(body.event,"guide-support-access"))return Response.json({error:"Guide authorization required."},{status:403});
  const command=parseMediaRequest(body.event);if(command?.action!=="guide-support-access")return Response.json({error:"Invalid action."},{status:403});
  return Response.json({version:1,plan:await guideSupportPlan(command.recipientPubkey)},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Guide plan verification unavailable."},{status:503});}
}
