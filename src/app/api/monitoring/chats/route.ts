import type {Event} from "nostr-tools";
import {ChatProvisionStore,type ChatProvisionAuthority,type ChatProvisionTier} from "../../../../chat-provisioning/store";
import {inspectArmadaGroup,verifyChatRoster} from "../../../../chat-provisioning/inspect";
import {authorizeChatProvision,type ChatProvisionAction} from "../../../../nostr/chat-provision-request";
import {paymentBody} from "../../../../payments/request-body";
import {getPaymentRuntime} from "../../../../payments/runtime";
import {queryAuthorizations,queryDirectoryRecords} from "../../../../nostr/city-records";
import {managedCities} from "../../../../nostr/moderation";
import {latestCityGrants} from "../../../../nostr/editor-management";
import {serverReadRelays} from "../../../../lib/server-relay-config";
import {SUPER_ADMIN_PUBKEY} from "../../../../nostr/authority";

export const dynamic="force-dynamic",runtime="nodejs";
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const safeRow=(row:ReturnType<ChatProvisionStore["rows"]>[number])=>({cityId:row.cityId,tier:row.tier,slug:row.slug,relay:row.relay,groupId:row.groupId,phase:row.phase,evidenceDigest:row.evidenceDigest,metadataEventId:row.metadataEventId,verifiedAt:row.verifiedAt,activatedAt:row.activatedAt,updatedAt:row.updatedAt});
type EligibleCity={cityId:string;cityName:string;slug:string;tier:ChatProvisionTier;organizerPubkey:string;guidePubkey:string;authority:ChatProvisionAuthority};
function managedAvatar(value:string,origin:string){let url:URL;try{url=new URL(value);}catch{throw new Error("The city group avatar is invalid.");}if(url.origin!==origin||!/^\/api\/og\/files\/[0-9a-f]{64}\.jpg$/.test(url.pathname)||url.search||url.hash)throw new Error("Use the current generated BitcoinWalk city avatar.");return url.href;}
async function eligible():Promise<EligibleCity[]>{
 const relays=serverReadRelays(),[{revisions,approvals},authorizations]=await Promise.all([queryDirectoryRecords(relays),queryAuthorizations(relays)]),db=getPaymentRuntime().store.db,grants=new Map(latestCityGrants(authorizations).map(row=>[row.grant.cityId,row.grant]));
 const guidePubkey=process.env.BITCOINWALK_GUIDE_PUBKEY;if(!guidePubkey||!/^[0-9a-f]{64}$/.test(guidePubkey)||guidePubkey===SUPER_ADMIN_PUBKEY)throw new Error("The BitcoinWalk Guide identity is not configured for city communities.");
 return Promise.all(managedCities(revisions,approvals).filter(row=>row.state==="approved").map(async row=>{
  const cityId=row.revision.city.cityId,slug=row.decision.approval.slug??row.revision.city.slug;
  const entitlement=db.prepare("SELECT invoiceId FROM paid_city_entitlement WHERE cityId=?").get(cityId) as {invoiceId:string}|undefined;
  const tier:ChatProvisionTier=entitlement?"pro":"basic",bindingId=entitlement?.invoiceId??row.decision.event.id,organizerPubkey=grants.get(cityId)?.creatorPubkey??row.revision.event.pubkey;
  if(!/^[0-9a-f]{64}$/.test(organizerPubkey))throw new Error(`The current organizer for ${row.revision.city.cityName} could not be verified.`);
  return {cityId,cityName:row.revision.city.cityName,slug,tier,organizerPubkey,guidePubkey,authority:{tier,bindingId,relay:tier==="pro"?`wss://${slug}.bitcoinwalk.org/`:"wss://chat.bitcoinwalk.org/"}};
 })).then(rows=>rows.sort((a,b)=>a.cityName.localeCompare(b.cityName)));
}
const publicCity=(city:EligibleCity)=>({cityId:city.cityId,cityName:city.cityName,slug:city.slug,tier:city.tier,organizerPubkey:city.organizerPubkey,guidePubkey:city.guidePubkey});
export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return response({error:"Chat provisioning authorization is not configured."},503);if(request.headers.get("origin")!==origin)return response({error:"Origin not allowed."},403);
 let body:{action?:ChatProvisionAction;event?:Event};try{body=await paymentBody(request) as typeof body;}catch{return response({error:"Signed super-admin authorization required."},403);}if(!body.action||!body.event)return response({error:"Signed super-admin authorization required."},403);const action=body.action;try{authorizeChatProvision(body.event,action,origin);}catch{return response({error:"Signed super-admin authorization required."},403);}
 try{
  const runtime=getPaymentRuntime(),store=new ChatProvisionStore(runtime.store.db),cities=await eligible();
  if(action.action==="list")return response({cities:cities.map(publicCity),rows:store.rows().map(safeRow)});
  const city=cities.find(row=>row.cityId===action.cityId);if(!city)return response({error:"A currently approved city is required."},409);
  if(action.action==="verify"){
   if(city.slug!==action.slug)return response({error:"The submitted slug is not the current approved city slug."},409);
   const expected={name:`BitcoinWalk ${city.cityName}`,picture:managedAvatar(action.picture,origin)},candidate=store.propose(action,Math.floor(Date.now()/1000),city.authority),inspection=await inspectArmadaGroup(candidate.relay,candidate.groupId,{expected});
   verifyChatRoster(action.rosterEvent,candidate.groupId,inspection.relayPubkey,[SUPER_ADMIN_PUBKEY,city.organizerPubkey,city.guidePubkey]);
   const verified=store.verify(city.cityId,inspection,Math.floor(Date.now()/1000),city.authority);
   return response({city:publicCity(city),inspection,row:safeRow(verified)});
  }
  if(action.action==="reconcile"){
   const row=store.get(city.cityId);if(!row||row.phase!=="active"||row.evidenceDigest!==action.evidenceDigest)return response({error:"Refresh the active community before reconciling its founding setup."},409);
   const inspection=await inspectArmadaGroup(row.relay,row.groupId,{expected:{name:`BitcoinWalk ${city.cityName}`,picture:managedAvatar(action.picture,origin)}});
   verifyChatRoster(action.rosterEvent,row.groupId,inspection.relayPubkey,[SUPER_ADMIN_PUBKEY,city.organizerPubkey,city.guidePubkey]);
   return response({city:publicCity(city),inspection,row:safeRow(store.refreshActiveMetadata(city.cityId,action.evidenceDigest,inspection,Math.floor(Date.now()/1000),city.authority))});
  }
  const row=store.get(city.cityId);if(!row||row.phase!=="verified"||row.evidenceDigest!==action.evidenceDigest)return response({error:"Verify the exact group again before activation."},409);
  const inspection=await inspectArmadaGroup(row.relay,row.groupId),refreshed=store.verify(city.cityId,inspection,Math.floor(Date.now()/1000),city.authority);if(inspection.metadataEventId!==row.metadataEventId)return response({error:"Group metadata changed. Review the fresh verification before activation.",row:safeRow(refreshed)},409);
  return response({city:publicCity(city),inspection,row:safeRow(store.activate(city.cityId,refreshed.evidenceDigest!,Math.floor(Date.now()/1000),city.authority))});
 }catch(error){return response({error:error instanceof Error?error.message:"Chat provisioning could not be completed."},409);}
}
