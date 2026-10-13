import type {Event} from "nostr-tools";
import {ChatProvisionStore} from "../../../../chat-provisioning/store";
import {inspectArmadaGroup} from "../../../../chat-provisioning/inspect";
import {authorizeChatProvision,type ChatProvisionAction} from "../../../../nostr/chat-provision-request";
import {paymentBody} from "../../../../payments/request-body";
import {getPaymentRuntime} from "../../../../payments/runtime";
import {queryDirectoryRecords} from "../../../../nostr/city-records";
import {managedCities} from "../../../../nostr/moderation";
import {serverReadRelays} from "../../../../lib/server-relay-config";

export const dynamic="force-dynamic",runtime="nodejs";
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const safeRow=(row:ReturnType<ChatProvisionStore["rows"]>[number])=>({cityId:row.cityId,slug:row.slug,relay:row.relay,groupId:row.groupId,phase:row.phase,evidenceDigest:row.evidenceDigest,metadataEventId:row.metadataEventId,verifiedAt:row.verifiedAt,activatedAt:row.activatedAt,updatedAt:row.updatedAt});
async function eligible(){const {revisions,approvals}=await queryDirectoryRecords(serverReadRelays()),db=getPaymentRuntime().store.db;return managedCities(revisions,approvals).filter(row=>row.state==="approved").flatMap(row=>{const entitlement=db.prepare("SELECT cityId FROM paid_city_entitlement WHERE cityId=?").get(row.revision.city.cityId);return entitlement?[{cityId:row.revision.city.cityId,cityName:row.revision.city.cityName,slug:row.decision.approval.slug??row.revision.city.slug}]:[];}).sort((a,b)=>a.cityName.localeCompare(b.cityName));}
export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return response({error:"Chat provisioning authorization is not configured."},503);if(request.headers.get("origin")!==origin)return response({error:"Origin not allowed."},403);
 let body:{action?:ChatProvisionAction;event?:Event};try{body=await paymentBody(request) as typeof body;}catch{return response({error:"Signed super-admin authorization required."},403);}if(!body.action||!body.event)return response({error:"Signed super-admin authorization required."},403);const action=body.action;try{authorizeChatProvision(body.event,action,origin);}catch{return response({error:"Signed super-admin authorization required."},403);}
 try{
  const runtime=getPaymentRuntime(),store=new ChatProvisionStore(runtime.store.db),cities=await eligible();
  if(action.action==="list")return response({cities,rows:store.rows().map(safeRow)});
  const city=cities.find(row=>row.cityId===action.cityId);if(!city)return response({error:"An approved paid city with a settled entitlement is required."},409);
  if(action.action==="verify"){
   if(city.slug!==action.slug)return response({error:"The submitted slug is not the current approved city slug."},409);
   const candidate=store.propose(action),inspection=await inspectArmadaGroup(candidate.relay,candidate.groupId),verified=store.verify(city.cityId,inspection);
   return response({city,inspection,row:safeRow(verified)});
  }
  const row=store.get(city.cityId);if(!row||row.phase!=="verified"||row.evidenceDigest!==action.evidenceDigest)return response({error:"Verify the exact group again before activation."},409);
  const inspection=await inspectArmadaGroup(row.relay,row.groupId),refreshed=store.verify(city.cityId,inspection);if(refreshed.evidenceDigest!==action.evidenceDigest)return response({error:"Group metadata changed. Review the fresh verification before activation.",row:safeRow(refreshed)},409);
  return response({city,inspection,row:safeRow(store.activate(city.cityId,action.evidenceDigest))});
 }catch(error){return response({error:error instanceof Error?error.message:"Chat provisioning could not be completed."},409);}
}
