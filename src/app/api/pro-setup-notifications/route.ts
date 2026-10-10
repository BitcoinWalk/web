import {type Event} from "nostr-tools";
import {isGuideRequester} from "../../../server/replication-status-auth";
import {listProSetupNotifications} from "../../../server/pro-setup";

export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event};
  if(!body.event||!isGuideRequester(body.event,"list-pro-setup-notifications"))return Response.json({error:"Guide authorization required."},{status:403});
  return Response.json({version:1,tasks:await listProSetupNotifications(),checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Pro setup notification status failed."},{status:503});}
}
