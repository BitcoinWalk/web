import type {Event} from "nostr-tools";
import {authorizeDirectorySuccessorRequest} from "../../../directory/successor-request-auth";
import {DirectorySuccessorRequestStore} from "../../../directory/successor-request-store";
import {serverReadRelays} from "../../../lib/server-relay-config";
import {relayConfig} from "../../../lib/relay-config";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
import {queryDirectoryRecords} from "../../../nostr/city-records";
import {discoverCityDirectoryChainForSigning,discoverExistingCityDirectoryRoot,normalizeDirectoryRelays} from "../../../nostr/city-directory";
import {managedCities} from "../../../nostr/moderation";
import {getPaymentRuntime} from "../../../payments/runtime";
import {paymentBody} from "../../../payments/request-body";

export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"};
const store=()=>new DirectorySuccessorRequestStore(getPaymentRuntime().store.db);

async function approvedCity(cityId:string){
 const snapshot=await queryDirectoryRecords(serverReadRelays());
 const row=managedCities(snapshot.revisions,snapshot.approvals).find(item=>item.state==="approved"&&item.revision.city.cityId===cityId);
 if(!row)throw new Error("Choose a currently approved city.");
 return {cityId,cityName:row.revision.city.cityName,cityRevisionId:row.revision.event.id,ownerPubkey:row.revision.event.pubkey};
}
async function anchoredState(cityId:string,ownerPubkey:string){
 const relays=normalizeDirectoryRelays(relayConfig.directoryRelays);
 const discovery=await discoverExistingCityDirectoryRoot(relays,cityId,ownerPubkey);
 if(!discovery.root)throw new Error("No anchored owner-signed directory root exists for this city.");
 const anchor={cityId,rootEventId:discovery.root.id,initialOwnerPubkey:discovery.root.pubkey};
 const chain=await discoverCityDirectoryChainForSigning(relays,anchor);
 if(chain.state.content.ownerPubkey!==ownerPubkey)throw new Error("The anchored directory owner differs from the currently approved city owner. Audit ownership before preparing a request.");
 return {anchor,state:chain.state};
}
function safe(error:unknown){const message=error instanceof Error?error.message:"Directory successor request unavailable.";return /^(Choose|No anchored|The anchored|This city|Only the verified|Directory successor)/.test(message)?message:"Directory successor request could not be completed safely.";}

export async function POST(request:Request){
 try{
  const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return Response.json({error:"Directory successor requests are not configured."},{status:503,headers});
  if(request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
  const body=await paymentBody(request) as {event?:Event};if(!body.event)return Response.json({error:"Signed authorization required."},{status:403,headers});
  let command;try{command=authorizeDirectorySuccessorRequest(body.event,origin);}catch{return Response.json({error:"Signed authorization required."},{status:403,headers});}
  const actor=body.event.pubkey,requests=store();
  if(command.action==="list")return Response.json({requests:requests.list(actor,SUPER_ADMIN_PUBKEY)},{headers});
  if(command.action==="prepare"){
   if(actor!==SUPER_ADMIN_PUBKEY)return Response.json({error:"Super-admin access required."},{status:403,headers});
   const city=await approvedCity(command.cityId),current=await anchoredState(city.cityId,city.ownerPubkey);
   return Response.json({request:requests.prepare({...city,createdBy:actor,rootEventId:current.anchor.rootEventId,initialOwnerPubkey:current.anchor.initialOwnerPubkey,predecessorEvent:current.state.currentEvent})},{headers});
  }
  const current=requests.get(command.requestId);if(!current)return Response.json({error:"Directory successor request was not found."},{status:404,headers});
  if(command.action==="sign"){
   const city=await approvedCity(current.cityId);
   if(city.cityRevisionId!==current.cityRevisionId||city.ownerPubkey!==current.ownerPubkey)throw new Error("Directory successor request is stale because the approved city identity changed. Ask the super-admin to supersede it.");
   const anchored=await anchoredState(current.cityId,current.initialOwnerPubkey);
   if(anchored.anchor.rootEventId!==current.rootEventId||anchored.state.currentEvent.id!==current.predecessorEvent.id)throw new Error("Directory successor request is stale because the anchored chain advanced. Ask the super-admin to supersede it.");
   return Response.json({request:requests.sign(current.id,actor,command.event)},{headers});
  }
  return Response.json({request:requests.transition(current.id,actor,command.action==="reject"?"rejected":"superseded",SUPER_ADMIN_PUBKEY)},{headers});
 }catch(error){return Response.json({error:safe(error)},{status:409,headers});}
}
