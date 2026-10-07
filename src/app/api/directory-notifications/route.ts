import {type Event} from "nostr-tools";
import {DirectoryRequestStore} from "../../../directory/request-store";
import {getPaymentRuntime} from "../../../payments/runtime";
import {isGuideRequester} from "../../../server/replication-status-auth";

export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event};
  if(!body.event||!isGuideRequester(body.event,"list-directory-notifications"))return Response.json({error:"Guide authorization required."},{status:403});
  const requests=new DirectoryRequestStore(getPaymentRuntime().store.db).guideRows();
  return Response.json({version:1,requests,checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Directory notification status failed."},{status:503});}
}
