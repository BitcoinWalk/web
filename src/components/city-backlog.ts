import type {CityRevision} from "../nostr/city-records";
import type {ManagedCity,NeedsChangesCity} from "../nostr/moderation";
import type {CityIdentityHealth} from "../server/pro-city-identity-health";
import type {PaidDirectoryCity} from "../domain/directory";

export type CityWorkflowStatus="action-required"|"awaits-change"|"online"|"offline";
export type CityRelayType="shared"|"dedicated"|"migrated";
export type CityWorkflowRow={
  cityId:string;cityName:string;slug:string;status:CityWorkflowStatus;online:boolean;
  tier:"basic"|"paid"|"test";relay:CityRelayType;source:"managed"|"pending"|"awaits-change"|"inventory";
  managed?:ManagedCity;pending?:CityRevision;needsChanges?:NeedsChangesCity;health?:CityIdentityHealth;
};

const priority:Record<CityWorkflowStatus,number>={"action-required":0,"awaits-change":1,online:2,offline:3};
const hostMustAct=(health?:CityIdentityHealth)=>!!health?.checks.some(check=>(check.key==="identity"||check.key==="recovery")&&check.state==="fail");

export function cityWorkflowRows(input:{managed:ManagedCity[];pending:CityRevision[];needsChanges:NeedsChangesCity[];rejected?:CityRevision[];health:CityIdentityHealth[];paidCityIds:Set<string>;paidCities:Record<string,PaidDirectoryCity>}):CityWorkflowRow[]{
  const {managed,pending,needsChanges,rejected=[],health,paidCityIds,paidCities}=input,rows=new Map<string,CityWorkflowRow>();
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
  for(const item of rejected){const city=item.city,h=healthById.get(city.cityId),paid=tier(city.cityId,h)==="paid";rows.set(city.cityId,{cityId:city.cityId,cityName:city.cityName,slug:city.slug,status:"offline",online:false,tier:tier(city.cityId,h),relay:relay(city.cityId,paid),source:"inventory",health:h});}
  for(const h of health){if(rows.has(h.cityId))continue;const paid=tier(h.cityId,h)==="paid",status:CityWorkflowStatus=h.status==="complete"?"online":hostMustAct(h)||h.status==="not-configured"?"awaits-change":"action-required";rows.set(h.cityId,{cityId:h.cityId,cityName:h.cityName,slug:h.slug,status,online:true,tier:tier(h.cityId,h),relay:relay(h.cityId,paid),source:"inventory",health:h});}
  return [...rows.values()].sort((a,b)=>priority[a.status]-priority[b.status]||a.cityName.localeCompare(b.cityName));
}

export const cityWorkflowLabel=(status:CityWorkflowStatus)=>({"action-required":"Action required","awaits-change":"Awaits change",online:"Online",offline:"Offline"})[status];
export const cityRelayLabel=(relay:CityRelayType)=>({shared:"Shared relay",dedicated:"Dedicated relay",migrated:"Own relay · migrated"})[relay];
