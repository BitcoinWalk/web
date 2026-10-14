import "server-only";
import {ChatProvisionStore} from "../chat-provisioning/store";
import {WalkieTalkieProvisionStore,WALKIE_TALKIE_RELAY} from "../chat-provisioning/walkie-talkie-store";
import type {ChatConfig} from "../domain/chat";
import {chatConfig} from "../lib/chat-config";
import {getPaymentRuntime} from "../payments/runtime";

/** Builds independent public Walkie Talkie and Armada routing from active
 * records whose original authority remains valid locally. */
export function serverChatConfig():ChatConfig{
 try{
  const db=getPaymentRuntime().store.db,registry=new ChatProvisionStore(db),walkieTalkie=new WalkieTalkieProvisionStore(db),paidCities:ChatConfig["paidCities"]={};
  for(const row of registry.active()){
   if(row.tier!=="pro")continue;
   const entitlement=db.prepare("SELECT invoiceId FROM paid_city_entitlement WHERE cityId=?").get(row.cityId) as {invoiceId:string}|undefined;
   if(entitlement?.invoiceId!==row.entitlementId)continue;
   const armadaDestination={relay:row.relay,groupId:row.groupId};paidCities[row.cityId]={slug:row.slug,tier:row.tier,destination:armadaDestination,armadaDestination,walkieTalkieDestination:null,walkieTalkieEnabled:false,armadaEnabled:row.armadaEnabled===1};
  }
  for(const row of walkieTalkie.active()){
   if(row.relay!==WALKIE_TALKIE_RELAY||row.groupId!==`bitcoinwalk-${row.slug}`)continue;
   const entitlement=db.prepare("SELECT invoiceId FROM paid_city_entitlement WHERE cityId=?").get(row.cityId) as {invoiceId:string}|undefined;
   if(row.tier==="pro"&&entitlement?.invoiceId!==row.authorityId)continue;
   const existing=paidCities[row.cityId],legacy=registry.get(row.cityId),walkieTalkieDestination={relay:row.relay,groupId:row.groupId};
   paidCities[row.cityId]={slug:row.slug,tier:row.tier,destination:existing?.destination??null,armadaDestination:existing?.armadaDestination??null,walkieTalkieDestination,walkieTalkieEnabled:legacy?legacy.walkieTalkieEnabled===1:true,armadaEnabled:existing?.armadaEnabled??false};
  }
  return {...chatConfig,paidCities};
 }catch{return chatConfig;}
}
