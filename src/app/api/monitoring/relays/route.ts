import {isSuperAdmin} from "../../../../nostr/authority";
import {loadRelayMonitorReport} from "../../../../server/relay-monitor-service";
export const dynamic="force-dynamic",runtime="nodejs";
export async function GET(request:Request){
 const actor=request.headers.get("x-bitcoinwalk-dashboard-pubkey")??"";
 if(!isSuperAdmin(actor))return Response.json({error:"Super-admin access required."},{status:403,headers:{"Cache-Control":"no-store"}});
 try{return Response.json(await loadRelayMonitorReport(),{headers:{"Cache-Control":"private, max-age=15"}});}catch{return Response.json({error:"Relay monitoring is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});}
}
