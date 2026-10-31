import "server-only";
import type {Event} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {queryRelayEvents} from "../nostr/city-records";
import {nip29HasParticipant,validNip29Destination} from "../nostr/nip29-chat";
import {resolveCityChat} from "../domain/chat";
import {summarizeProCommunityHandoffs,type ProCommunityHandoffOutcomes,type ProCommunityHandoffState} from "../domain/pro-community-handoff-outcomes";
import {getPaymentRuntime} from "../payments/runtime";
import type {CityIdentityHealth} from "./pro-city-identity-health";
import {serverChatConfig} from "./chat-config";

const hex=/^[0-9a-f]{64}$/;
const table=(name:string)=>!!getPaymentRuntime().store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);

/** Confirms that each current Pro owner appears in the latest signed roster for
 * that city's exact configured community. This reads current state only. */
export async function loadProCommunityHandoffOutcomes(actor:string,health:CityIdentityHealth[],checkedAt=Math.floor(Date.now()/1000)):Promise<ProCommunityHandoffOutcomes>{
 if(actor!==SUPER_ADMIN_PUBKEY)throw new Error("Super-admin review required.");
 const cities=[...new Map(health.filter(row=>row.availableInEnvironment&&row.tier==="pro").map(row=>[row.cityId,row])).values()];
 const db=getPaymentRuntime().store.db,owners=new Map<string,string>();
 if(table("pro_setup_task"))for(const row of db.prepare("SELECT cityId,currentOwnerPubkey FROM pro_setup_task").all() as {cityId:string;currentOwnerPubkey:string}[])owners.set(row.cityId,row.currentOwnerPubkey);
 const config=serverChatConfig(),prepared=cities.map(city=>({owner:owners.get(city.cityId),destination:validNip29Destination(resolveCityChat(city.cityId,city.slug,config,true).nip29)}));
 const groups=new Map<string,{relay:string;groupIds:Set<string>}>();
 for(const row of prepared){if(!row.owner||!hex.test(row.owner)||!row.destination)continue;const key=row.destination.relay,group=groups.get(key)??{relay:key,groupIds:new Set<string>()};group.groupIds.add(row.destination.groupId);groups.set(key,group);}
 const reads=new Map<string,{events:Event[];failed:boolean}>();
 await Promise.all([...groups.values()].map(async group=>{try{reads.set(group.relay,{events:await queryRelayEvents([group.relay],[39002],undefined,{"#d":[...group.groupIds],limit:Math.min(500,Math.max(50,group.groupIds.size*5))}),failed:false});}catch{reads.set(group.relay,{events:[],failed:true});}}));
 const states:ProCommunityHandoffState[]=prepared.map(row=>{
  if(!row.owner||!hex.test(row.owner)||!row.destination)return "action-required";
  const read=reads.get(row.destination.relay);if(!read||read.failed)return "unknown";
  const present=nip29HasParticipant(read.events,row.destination.groupId,row.owner);
  return present===null?"unknown":present?"confirmed":"action-required";
 });
 return summarizeProCommunityHandoffs(states,checkedAt);
}
