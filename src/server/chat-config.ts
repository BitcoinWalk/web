import "server-only";
import {ChatProvisionStore} from "../chat-provisioning/store";
import type {ChatConfig} from "../domain/chat";
import {chatConfig} from "../lib/chat-config";
import {getPaymentRuntime} from "../payments/runtime";

/** Builds public chat routing only from active records whose original settled
 * entitlement is still present. A database/configuration failure keeps the
 * static global community available but never invents a paid destination. */
export function serverChatConfig():ChatConfig{
 try{
  const db=getPaymentRuntime().store.db,registry=new ChatProvisionStore(db),paidCities:ChatConfig["paidCities"]={};
  for(const row of registry.active()){
   const entitlement=db.prepare("SELECT invoiceId FROM paid_city_entitlement WHERE cityId=?").get(row.cityId) as {invoiceId:string}|undefined;
   if(entitlement?.invoiceId!==row.entitlementId)continue;
   paidCities[row.cityId]={slug:row.slug,destination:{relay:row.relay,groupId:row.groupId},walkieTalkieEnabled:row.walkieTalkieEnabled===1,armadaEnabled:row.armadaEnabled===1};
  }
  return {...chatConfig,paidCities};
 }catch{return chatConfig;}
}
