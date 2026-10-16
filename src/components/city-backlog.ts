import type {CityRevision} from "../nostr/city-records";
import type {ManagedCity,NeedsChangesCity} from "../nostr/moderation";
import type {CityIdentityHealth} from "../server/pro-city-identity-health";
import type {PaidDirectoryCity} from "../domain/directory";
import {visibleDecisionNote} from "../domain/admin-city-requests";

export type CityWorkflowStatus="action-required"|"awaits-change"|"online"|"offline";
export type CityRelayType="shared"|"dedicated"|"migrated";
export type CityTypeFilter="all"|"basic"|"pro-managed"|"pro-own";
export type CityWorkflowAction="open-record"|"open-public"|"review-request"|"view-decision"|"manage-pro"|"set-online"|"set-offline"|"archive"|"delete";
export type CityWorkflowRow={
  cityId:string;cityName:string;slug:string;status:CityWorkflowStatus;online:boolean;
  tier:"basic"|"paid"|"test";relay:CityRelayType;source:"managed"|"pending"|"awaits-change"|"inventory";
  managed?:ManagedCity;pending?:CityRevision;needsChanges?:NeedsChangesCity;rejected?:CityRevision;health?:CityIdentityHealth;
};
export type CityWorkflowNextStep={owner:"Super-admin"|"City host"|"External provider";action:string;helpHref?:string};

const hostGuide="https://docs.bitcoinwalk.org/hosts/complete-city-setup/";

const priority:Record<CityWorkflowStatus,number>={"action-required":0,"awaits-change":1,online:2,offline:3};
const hostMustAct=(health?:CityIdentityHealth)=>!!health?.checks.some(check=>(check.key==="identity"||check.key==="recovery")&&check.state==="fail");

export function cityWorkflowRows(input:{managed:ManagedCity[];pending:CityRevision[];needsChanges:NeedsChangesCity[];rejected?:CityRevision[];health:CityIdentityHealth[];paidCityIds:Set<string>;paidCities:Record<string,PaidDirectoryCity>;excludedCityIds?:Set<string>}):CityWorkflowRow[]{
  const {managed,pending,needsChanges,rejected=[],health,paidCityIds,paidCities,excludedCityIds=new Set<string>()}=input,rows=new Map<string,CityWorkflowRow>();
  const healthById=new Map(health.map(item=>[item.cityId,item]));
  const tier=(cityId:string,healthRow?:CityIdentityHealth):CityWorkflowRow["tier"]=>healthRow?.tier==="pilot"?"test":paidCityIds.has(cityId)||!!paidCities[cityId]||healthRow?.tier==="pro"?"paid":"basic";
  const relay=(cityId:string,paid:boolean):CityRelayType=>paidCities[cityId]?.relayMode==="migrated"?"migrated":paid?"dedicated":"shared";
  for(const row of managed){
    const city=row.revision.city,h=healthById.get(city.cityId),paid=tier(city.cityId,h)==="paid";
    let status:CityWorkflowStatus=row.state==="approved"?"online":"offline";
    if(row.state==="approved"&&h?.status==="action-required")status=hostMustAct(h)?"awaits-change":"action-required";
    if(row.state==="approved"&&h?.status==="not-configured")status="awaits-change";
    rows.set(city.cityId,{cityId:city.cityId,cityName:city.cityName,slug:row.decision.approval.slug??city.slug,status,online:row.state==="approved",tier:tier(city.cityId,h),relay:relay(city.cityId,paid),source:"managed",managed:row,health:h});
  }
  for(const item of needsChanges){const city=item.revision.city,h=healthById.get(city.cityId),paid=tier(city.cityId,h)==="paid";rows.set(city.cityId,{cityId:city.cityId,cityName:city.cityName,slug:city.slug,status:"awaits-change",online:false,tier:tier(city.cityId,h),relay:relay(city.cityId,paid),source:"awaits-change",needsChanges:item,health:h});}
  for(const item of pending){const city=item.city,h=healthById.get(city.cityId),paid=tier(city.cityId,h)==="paid";rows.set(city.cityId,{cityId:city.cityId,cityName:city.cityName,slug:city.slug,status:"action-required",online:false,tier:tier(city.cityId,h),relay:relay(city.cityId,paid),source:"pending",pending:item,health:h});}
  for(const item of rejected){const city=item.city,h=healthById.get(city.cityId),paid=tier(city.cityId,h)==="paid";rows.set(city.cityId,{cityId:city.cityId,cityName:city.cityName,slug:city.slug,status:"offline",online:false,tier:tier(city.cityId,h),relay:relay(city.cityId,paid),source:"inventory",rejected:item,health:h});}
  for(const h of health){if(rows.has(h.cityId)||excludedCityIds.has(h.cityId))continue;const paid=tier(h.cityId,h)==="paid",status:CityWorkflowStatus=h.status==="complete"?"online":hostMustAct(h)||h.status==="not-configured"?"awaits-change":"action-required";rows.set(h.cityId,{cityId:h.cityId,cityName:h.cityName,slug:h.slug,status,online:true,tier:tier(h.cityId,h),relay:relay(h.cityId,paid),source:"inventory",health:h});}
  return [...rows.values()].sort((a,b)=>priority[a.status]-priority[b.status]||a.cityName.localeCompare(b.cityName));
}

export const cityWorkflowLabel=(status:CityWorkflowStatus)=>({"action-required":"Action required","awaits-change":"Awaits change",online:"Online",offline:"Offline"})[status];
export const cityRelayLabel=(relay:CityRelayType)=>({shared:"Shared relay",dedicated:"Dedicated relay",migrated:"Own relay · migrated"})[relay];
export function cityMatchesType(row:CityWorkflowRow,filter:CityTypeFilter){
 if(filter==="all")return true;
 if(filter==="basic")return row.tier==="basic";
 if(filter==="pro-own")return row.tier==="paid"&&row.relay==="migrated";
 return row.tier==="paid"&&row.relay!=="migrated";
}

/** A compact operational instruction for rows that genuinely need work. The
 * owner follows the same boundary used to classify Action required versus
 * Awaits change; it never asks the super-admin to manufacture host proof. */
export function cityWorkflowNextStep(row:CityWorkflowRow):CityWorkflowNextStep|null{
 if(row.status!=="action-required"&&row.status!=="awaits-change")return null;
 if(row.source==="pending")return {owner:"Super-admin",action:"review the city application and accept it, request changes or reject it."};
 if(row.source==="awaits-change"){
  const note=visibleDecisionNote(row.needsChanges?.rejection.approval.note).replace(/\s+/g," ").trim();
  return {owner:"City host",action:note||"make the requested corrections and submit the city again.",helpHref:`${hostGuide}#correct-and-resubmit-a-city-application`};
 }
 const failed=new Set(row.health?.checks.filter(check=>check.state==="fail").map(check=>check.key)??[]);
 if(failed.has("identity")||failed.has("recovery")){
  const action=failed.has("identity")&&failed.has("recovery")?"connect the dedicated city signer and confirm its recovery method.":failed.has("identity")?"create or reconnect the exact dedicated city signer.":"confirm the city signer’s protected recovery method.";
  const anchor=failed.has("identity")?"connect-the-city-identity":"confirm-the-recovery-method";
  return {owner:"City host",action,helpHref:`${hostGuide}#${anchor}`};
 }
 if(row.health?.status==="not-configured")return {owner:"City host",action:"open Pro setup and complete the city identity and recovery steps.",helpHref:`${hostGuide}#complete-pro-city-setup`};
 if(failed.has("binding"))return {owner:"Super-admin",action:"review and sign the city-identity activation request after checking the host proof."};
 const provisioning=[failed.has("profile")?"public profile":null,failed.has("nip05")?"NIP-05":null,failed.has("lightning")?"Lightning address":null].filter((value):value is string=>!!value);
 if(provisioning.length)return {owner:"Super-admin",action:`verify the ${new Intl.ListFormat("en",{style:"long",type:"conjunction"}).format(provisioning)} evidence and retry provisioning.`};
 if(row.health?.checks.some(check=>check.state==="unknown"))return {owner:"Super-admin",action:"recheck the unavailable verification evidence before changing anything."};
 return row.status==="awaits-change"?{owner:"External provider",action:"supply the missing verification evidence; the super-admin should recheck it afterwards."}:{owner:"Super-admin",action:"open the city record and review the unresolved requirement."};
}

export function cityWorkflowActions(row:CityWorkflowRow):CityWorkflowAction[]{
 if(row.source==="pending")return ["review-request"];
 if(row.source==="awaits-change")return ["review-request",...(row.tier==="basic"?["archive" as const]:[])];
 if(row.managed){
  const actions:CityWorkflowAction[]=["open-record"];
  if(row.online)actions.push("open-public");
  if(row.health?.availableInEnvironment&&row.tier!=="basic"&&row.health.status!=="complete")actions.push("manage-pro");
  actions.push(row.managed.state==="approved"?"set-offline":"set-online");
  if(!row.online)actions.push("delete");
  return actions;
 }
 if(row.rejected)return ["view-decision"];
 const actions:CityWorkflowAction[]=[];
 if(row.health){actions.push("open-public");if(row.health.availableInEnvironment&&row.tier!=="basic"&&row.health.status!=="complete")actions.push("manage-pro");}
 return actions;
}
