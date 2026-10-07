import type {Event} from "nostr-tools";
import {authorizeDirectoryRequest} from "../../../directory/request-auth";
import {DirectoryRequestStore} from "../../../directory/request-store";
import {serverReadRelays} from "../../../lib/server-relay-config";
import {relayConfig} from "../../../lib/relay-config";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
import {queryDirectoryRecords} from "../../../nostr/city-records";
import {discoverExistingCityDirectoryRoot,normalizeDirectoryRelays,normalizeRootWssRelay} from "../../../nostr/city-directory";
import {managedCities} from "../../../nostr/moderation";
import {getPaymentRuntime} from "../../../payments/runtime";
import {paymentBody} from "../../../payments/request-body";

export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"};
const store=()=>new DirectoryRequestStore(getPaymentRuntime().store.db);

async function approvedCity(cityId:string){
 const snapshot=await queryDirectoryRecords(serverReadRelays());
 const row=managedCities(snapshot.revisions,snapshot.approvals).find(item=>item.state==="approved"&&item.revision.city.cityId===cityId);
 if(!row)throw new Error("Choose a currently approved city.");
 return {cityId,cityName:row.revision.city.cityName,cityRevisionId:row.revision.event.id,ownerPubkey:row.revision.event.pubkey};
}
async function assertRootStillAbsent(cityId:string,ownerPubkey:string){
 const discovery=normalizeDirectoryRelays(relayConfig.directoryRelays),existing=await discoverExistingCityDirectoryRoot(discovery,cityId,ownerPubkey);
 if(existing.root)throw new Error("An owner-signed directory root already exists. Use audited successor tooling; a second root will not be prepared.");
}
function safe(error:unknown){const message=error instanceof Error?error.message:"Directory request unavailable.";return /^(Choose|This city|An owner-signed|Only the verified|Use a separate|Directory request|Recovery identity)/.test(message)?message:"Directory request could not be completed safely.";}

export async function POST(request:Request){
 try{
  const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return Response.json({error:"Directory requests are not configured."},{status:503,headers});
  if(request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
  const body=await paymentBody(request) as {event?:Event};if(!body.event)return Response.json({error:"Signed authorization required."},{status:403,headers});
  let command;try{command=authorizeDirectoryRequest(body.event,origin);}catch{return Response.json({error:"Signed authorization required."},{status:403,headers});}
  const actor=body.event.pubkey,requests=store();
  if(command.action==="list")return Response.json({requests:requests.list(actor,SUPER_ADMIN_PUBKEY)},{headers});
  if(command.action==="prepare"){
   if(actor!==SUPER_ADMIN_PUBKEY)return Response.json({error:"Super-admin access required."},{status:403,headers});
   const city=await approvedCity(command.cityId);await assertRootStillAbsent(city.cityId,city.ownerPubkey);
   const primaryRelay=normalizeRootWssRelay(command.primaryRelay),mirrorRelays=command.mirrorRelays.map(normalizeRootWssRelay),operatorPubkeys=[...new Set(command.operatorPubkeys)].sort();
   if(!operatorPubkeys.includes(SUPER_ADMIN_PUBKEY))throw new Error("The BitcoinWalk super-admin must be visible as an endpoint-only operator for the managed London pilot.");
   return Response.json({request:requests.prepare({...city,createdBy:actor,primaryRelay,mirrorRelays,operatorPubkeys})},{headers});
  }
  const current=requests.get(command.requestId);if(!current)return Response.json({error:"Directory request was not found."},{status:404,headers});
  if(command.action==="sign"){
   const city=await approvedCity(current.cityId);
   if(city.cityRevisionId!==current.cityRevisionId||city.ownerPubkey!==current.ownerPubkey)throw new Error("Directory request is stale because the approved city identity changed. Ask the super-admin to supersede it.");
   await assertRootStillAbsent(current.cityId,current.ownerPubkey);
   return Response.json({request:requests.sign(current.id,actor,command.recoveryNpub,command.event)},{headers});
  }
  return Response.json({request:requests.transition(current.id,actor,command.action==="reject"?"rejected":"superseded",SUPER_ADMIN_PUBKEY)},{headers});
 }catch(error){return Response.json({error:safe(error)},{status:409,headers});}
}
