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
 if(command.action==="list"){const endpointOwner=command.endpointHash?value.endpointOwner(command.endpointHash):undefined;return reply({devices:value.list(actor),currentEndpoint:endpointOwner===undefined?"unlinked":endpointOwner===actor?"current":"other"});}
 if(command.action==="save"){const endpoint=safePushEndpoint(command.subscription.endpoint);return reply({devices:value.save(actor,{id:command.deviceId,label:command.label,endpoint,p256dh:command.subscription.keys.p256dh,auth:command.subscription.keys.auth,preferences:command.preferences}),currentEndpoint:"current"});}
 if(command.action==="preferences")return reply({devices:value.update(actor,command.deviceId,command.preferences),currentEndpoint:"current"});
 if(command.action==="remove")return reply({devices:value.remove(actor,command.deviceId),currentEndpoint:"unlinked"});
 const device=value.reserveTest(actor,command.deviceId);try{await deliverWebPush(device,{title:"BitcoinWalk notifications are ready",body:"This device can receive private, consent-based updates.",path:"/admin/notifications",tag:"bitcoinwalk-notification-test"});value.delivered(actor,device.id);return reply({devices:value.list(actor),sent:true,currentEndpoint:"current"});}catch(error){const status=typeof error==="object"&&error&&"statusCode" in error?Number((error as {statusCode?:number}).statusCode):0;if(status===404||status===410){value.remove(actor,device.id,"expired");return reply({error:"This browser subscription expired. Set up notifications again.",devices:value.list(actor)},410);}value.failed(actor,device.id);throw error;}
 }catch(error){return reply({error:error instanceof Error?error.message:"Notification request failed."},400);}}
