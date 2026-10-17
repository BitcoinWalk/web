import type {Event} from "nostr-tools";
import {isGuideRequester} from "../../../server/replication-status-auth";
import {listOrganizerChatInvitations} from "../../../server/organizer-chat-invitations";

export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event};
  if(!body.event||!isGuideRequester(body.event,"list-organizer-chat-invitations"))return Response.json({error:"Guide authorization required."},{status:403});
  return Response.json({version:1,hosts:await listOrganizerChatInvitations(),checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Host invitation status failed."},{status:503});}
}
