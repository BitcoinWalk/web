import type {Event} from "nostr-tools";
import {getPaymentRuntime} from "../../../payments/runtime";
import {authorizeWebPushCommand} from "../../../notifications/web-push-auth";
import {deliverWebPush,safePushEndpoint,webPushConfig} from "../../../notifications/web-push-delivery";
import {WebPushStore} from "../../../notifications/web-push-store";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
const store=()=>new WebPushStore(getPaymentRuntime().store.db);
export async function GET(){const config=webPushConfig();return reply({available:Boolean(config),publicKey:config?.publicKey??null});}
export async function POST(request:Request){const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return reply({error:"Notifications are not configured."},503);if(request.headers.get("origin")!==origin)return reply({error:"Origin not allowed."},403);let body:{event?:Event};try{body=await request.json() as typeof body;}catch{return reply({error:"Signed notification authorization required."},403);}if(!body.event)return reply({error:"Signed notification authorization required."},403);let command;try{command=authorizeWebPushCommand(body.event,origin);}catch{return reply({error:"Signed notification authorization required."},403);}const actor=body.event.pubkey,value=store();try{
 const result=(currentEndpoint:"current"|"other"|"unlinked",extra:Record<string,unknown>={})=>({devices:value.list(actor),notices:value.listNotices(actor),currentEndpoint,...extra});
 if(command.action==="list"){const endpointOwner=command.endpointHash?value.endpointOwner(command.endpointHash):undefined;return reply(result(endpointOwner===undefined?"unlinked":endpointOwner===actor?"current":"other"));}
 if(command.action==="save"){const endpoint=safePushEndpoint(command.subscription.endpoint);value.save(actor,{id:command.deviceId,label:command.label,endpoint,p256dh:command.subscription.keys.p256dh,auth:command.subscription.keys.auth,preferences:command.preferences});return reply(result("current"));}
 if(command.action==="preferences"){value.update(actor,command.deviceId,command.preferences);return reply(result("current"));}
 if(command.action==="remove"){value.remove(actor,command.deviceId);return reply(result("unlinked"));}
 if(command.action==="read-notice"){value.readNotice(actor,command.noticeId);return reply(result("current"));}
 if(command.action==="read-all-notices"){value.readAllNotices(actor);return reply(result("current"));}
 const device=value.reserveTest(actor,command.deviceId),noticeId=value.createNotice(actor,{category:"workflow",title:"BitcoinWalk notifications are ready",body:"This browser can receive private updates. Important notices will also remain available here.",path:"/admin/notifications"}).id;try{await deliverWebPush(device,{title:"BitcoinWalk notifications are ready",body:"This device can receive private, consent-based updates.",path:"/admin/notifications",tag:"bitcoinwalk-notification-test"});value.delivered(actor,device.id);value.noticePushState(actor,noticeId,"sent");return reply(result("current",{sent:true}));}catch(error){value.noticePushState(actor,noticeId,"failed");const status=typeof error==="object"&&error&&"statusCode" in error?Number((error as {statusCode?:number}).statusCode):0;if(status===404||status===410){value.remove(actor,device.id,"expired");return reply({...result("unlinked"),error:"This browser subscription expired. Set up notifications again."},410);}value.failed(actor,device.id);return reply({...result("current"),error:"Browser delivery failed. The notice is still available in your BitcoinWalk inbox."},502);}
 }catch(error){return reply({error:error instanceof Error?error.message:"Notification request failed."},400);}}
