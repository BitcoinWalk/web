import type {Event} from "nostr-tools";
import {authorizeIdleCommand} from "../../../guide/idle-contract";
import {IdleReminderPreferences} from "../../../server/idle-reminder-preferences";
import {idleReminderSnapshot} from "../../../server/idle-reminder-snapshot";
import {getPaymentRuntime} from "../../../payments/runtime";
import {isGuideRequester} from "../../../server/replication-status-auth";
import {queryAuthorizations} from "../../../nostr/city-records";
import {latestCityGrants} from "../../../nostr/editor-management";
import {cityOwnerPubkey} from "../../../domain/city";
import {serverReadRelays} from "../../../lib/server-relay-config";

export const dynamic="force-dynamic",runtime="nodejs";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event};if(!body.event)return reply({error:"Signed authorization required."},403);
  if(isGuideRequester(body.event,"list-idle-reminders"))return reply(await idleReminderSnapshot(new IdleReminderPreferences(getPaymentRuntime().store.db)));
  const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;
  if(!origin||request.headers.get("origin")!==origin)return reply({error:"Origin not allowed."},403);
  let command;try{command=authorizeIdleCommand(body.event,origin);}catch{return reply({error:"Signed authorization required."},403);}
  const grant=latestCityGrants(await queryAuthorizations(serverReadRelays())).find(row=>row.grant.cityId===command.cityId)?.grant;
  if(!grant||cityOwnerPubkey(grant)!==body.event.pubkey)return reply({error:"Only the current city owner can change reminders."},403);
  const preferences=new IdleReminderPreferences(getPaymentRuntime().store.db),now=Math.floor(Date.now()/1000);
  return reply({preference:command.action==="read"?preferences.read(command.cityId,body.event.pubkey):preferences.save(command.cityId,body.event.pubkey,command,now),paused:process.env.BITCOINWALK_IDLE_REMINDERS_ENABLED!=="true"});
 }catch{return reply({error:"Reminders could not be checked or saved. Refresh and retry; no messages were sent."},503);}
}
