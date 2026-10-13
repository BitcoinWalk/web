import type {Event} from "nostr-tools";
import {authorizeRelayMonitor} from "../../../../nostr/relay-monitor-request";
import {paymentBody} from "../../../../payments/request-body";
import {loadRelayMonitorReport} from "../../../../server/relay-monitor-service";
export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;
 if(!origin)return Response.json({error:"Relay monitoring authorization is not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 if(request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers:{"Cache-Control":"no-store"}});
 let event:Event|undefined;try{event=(await paymentBody(request) as {event?:Event}).event;}catch{return Response.json({error:"Signed super-admin authorization required."},{status:403,headers:{"Cache-Control":"no-store"}});}
 try{if(!event)throw new Error();authorizeRelayMonitor(event,origin);}catch{return Response.json({error:"Signed super-admin authorization required."},{status:403,headers:{"Cache-Control":"no-store"}});}
 try{return Response.json(await loadRelayMonitorReport(),{headers:{"Cache-Control":"private, max-age=15"}});}catch{return Response.json({error:"Relay monitoring is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});}
}
