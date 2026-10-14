import "server-only";
import {ChatProvisionStore,SHARED_CITY_CHAT_RELAY} from "../chat-provisioning/store";
import type {ChatConfig} from "../domain/chat";
import {chatConfig} from "../lib/chat-config";
import {getPaymentRuntime} from "../payments/runtime";

/** Builds public chat routing only from active records whose original authority
 * remains valid locally. Pro records require their settled entitlement; Basic
 * records remain scoped to the shared relay and their approved city ID. */
export function serverChatConfig():ChatConfig{
 try{
  const db=getPaymentRuntime().store.db,registry=new ChatProvisionStore(db),paidCities:ChatConfig["paidCities"]={};
  for(const row of registry.active()){
   const entitlement=db.prepare("SELECT invoiceId FROM paid_city_entitlement WHERE cityId=?").get(row.cityId) as {invoiceId:string}|undefined;
   if(row.tier==="pro"&&entitlement?.invoiceId!==row.entitlementId)continue;
   // Legacy dedicated records remain routable during their explicit, verified
   // move. Every newly activated destination is constrained to the shared relay.
   if(row.tier==="basic"&&row.relay!==SHARED_CITY_CHAT_RELAY)continue;
   paidCities[row.cityId]={slug:row.slug,tier:row.tier,destination:{relay:row.relay,groupId:row.groupId},walkieTalkieEnabled:row.walkieTalkieEnabled===1,armadaEnabled:row.armadaEnabled===1};
  }
  return {...chatConfig,paidCities};
 }catch{return chatConfig;}
}
