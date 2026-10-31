import type {Event} from "nostr-tools";
import {ChatProvisionStore,type ChatProvisionAuthority} from "../../../../chat-provisioning/store";
import {inspectArmadaGroup} from "../../../../chat-provisioning/inspect";
import {authorizeArmadaProvision,type ArmadaProvisionAction} from "../../../../nostr/armada-provision-request";
import {paymentBody} from "../../../../payments/request-body";
import {getPaymentRuntime} from "../../../../payments/runtime";
import {queryDirectoryRecords} from "../../../../nostr/city-records";
import {managedCities} from "../../../../nostr/moderation";
import {serverReadRelays} from "../../../../lib/server-relay-config";

export const dynamic="force-dynamic",runtime="nodejs";
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const safeRow=(row:ReturnType<ChatProvisionStore["rows"]>[number])=>({cityId:row.cityId,slug:row.slug,relay:row.relay,groupId:row.groupId,phase:row.phase,evidenceDigest:row.evidenceDigest,metadataEventId:row.metadataEventId,verifiedAt:row.verifiedAt,activatedAt:row.activatedAt,updatedAt:row.updatedAt});
type City={cityId:string;cityName:string;slug:string;authority:ChatProvisionAuthority};
function managedAvatar(value:string,origin:string){let url:URL;try{url=new URL(value);}catch{throw new Error("The Armada avatar is invalid.");}if(url.origin!==origin||!/^\/api\/og\/files\/[0-9a-f]{64}\.jpg$/.test(url.pathname)||url.search||url.hash)throw new Error("Use the current generated BitcoinWalk city avatar.");return url.href;}
async function eligible():Promise<City[]>{const {revisions,approvals}=await queryDirectoryRecords(serverReadRelays()),db=getPaymentRuntime().store.db;return managedCities(revisions,approvals).filter(row=>row.state==="approved").flatMap(row=>{const cityId=row.revision.city.cityId,entitlement=db.prepare("SELECT invoiceId FROM paid_city_entitlement WHERE cityId=?").get(cityId) as {invoiceId:string}|undefined;if(!entitlement)return [];const slug=row.decision.approval.slug??row.revision.city.slug;return [{cityId,cityName:row.revision.city.cityName,slug,authority:{tier:"pro",bindingId:entitlement.invoiceId,relay:`wss://${slug}.bitcoinwalk.org/`} as ChatProvisionAuthority}];}).sort((a,b)=>a.cityName.localeCompare(b.cityName));}
const publicCity=({authority:_,...city}:City)=>city;
export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return response({error:"Armada provisioning authorization is not configured."},503);if(request.headers.get("origin")!==origin)return response({error:"Origin not allowed."},403);
 let body:{action?:ArmadaProvisionAction;event?:Event};try{body=await paymentBody(request) as typeof body;}catch{return response({error:"Signed super-admin authorization required."},403);}if(!body.action||!body.event)return response({error:"Signed super-admin authorization required."},403);const action=body.action;try{authorizeArmadaProvision(body.event,action,origin);}catch{return response({error:"Signed super-admin authorization required."},403);}
 try{
  const store=new ChatProvisionStore(getPaymentRuntime().store.db),cities=await eligible();
  if(action.action==="list")return response({cities:cities.map(publicCity),rows:store.rows().filter(row=>row.tier==="pro"&&row.relay!=="wss://chat.bitcoinwalk.org/").map(safeRow)});
  const city=cities.find(row=>row.cityId===action.cityId);if(!city)return response({error:"A currently approved Pro city is required."},409);
  if(action.action==="verify"){
   if(action.slug!==city.slug||action.groupId!==`bitcoinwalk-${city.slug}`)return response({error:"Use the canonical Armada group for this city."},409);
   const picture=managedAvatar(action.picture,origin),candidate=store.propose(action,Math.floor(Date.now()/1000),city.authority),inspection=await inspectArmadaGroup(candidate.relay,candidate.groupId,{expected:{name:`BitcoinWalk ${city.cityName}`,picture}}),verified=store.verify(city.cityId,inspection,Math.floor(Date.now()/1000),city.authority);
   return response({city:publicCity(city),inspection,row:safeRow(verified)});
  }
  const row=store.get(city.cityId);if(!row||row.phase!=="verified"||row.evidenceDigest!==action.evidenceDigest)return response({error:"Verify the exact Armada group again before activation."},409);
  const inspection=await inspectArmadaGroup(row.relay,row.groupId),refreshed=store.verify(city.cityId,inspection,Math.floor(Date.now()/1000),city.authority);if(inspection.metadataEventId!==row.metadataEventId)return response({error:"Armada group metadata changed. Review the fresh verification before activation.",row:safeRow(refreshed)},409);
  return response({city:publicCity(city),inspection,row:safeRow(store.activate(city.cityId,refreshed.evidenceDigest!,Math.floor(Date.now()/1000),city.authority))});
 }catch(error){return response({error:error instanceof Error?error.message:"Armada provisioning could not be completed."},409);}
}
