import {timingSafeEqual} from "node:crypto";
import {getPaymentRuntime} from "../../../../../payments/runtime";
import {runNotificationScan} from "../../../../../notifications/notification-scan";
import {WebPushStore} from "../../../../../notifications/web-push-store";

export const dynamic="force-dynamic",runtime="nodejs";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
function authorized(request:Request,token:string){const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";return supplied.length===token.length&&timingSafeEqual(Buffer.from(supplied),Buffer.from(token));}
export async function POST(request:Request){
 const token=process.env.BITCOINWALK_NOTIFICATION_RUN_TOKEN?.trim();
 if(process.env.BITCOINWALK_NOTIFICATION_SENDERS_ENABLED!=="1"||!token)return new Response(null,{status:404});
 if(!authorized(request,token))return reply({error:"Notification runner authorization required."},403);
 try{return reply(await runNotificationScan(new WebPushStore(getPaymentRuntime().store.db)));}catch{return reply({error:"Notification scan could not complete safely. Nothing was inferred from partial data."},503);}
}
