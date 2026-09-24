import {compareEvents} from "nostr-tools";
import {isSuperAdmin} from "./authority";
import {queryAuthorizations,queryDirectoryRecords,queryCalendarEvents,pendingCityRevisions,type AuthorizationRecord,type CityRevision} from "./city-records";
import {approvedCalendarWalks} from "./calendar-records";
import {queryHostedWalks,type HostedWalk} from "./hosted-walks";
import {canEditCity} from "./organizer-edit";
import {managedCalendarEvents} from "../domain/event-routing";
import {showCityInPicker} from "../domain/city-picker";

export type DashboardCity={id:string;name:string};
export function latestDashboardGrants(grants:AuthorizationRecord[]){const latest=new Map<string,AuthorizationRecord>();for(const r of [...grants].sort((a,b)=>compareEvents(a.event,b.event)))if(!latest.has(r.grant.cityId))latest.set(r.grant.cityId,r);return [...latest.values()];}
export function dashboardCities(actor:string,grants:AuthorizationRecord[],revisions:CityRevision[],hosted:HostedWalk[]):DashboardCity[]{
 const permitted=new Set(latestDashboardGrants(grants).filter(r=>canEditCity(actor,r.grant)).map(r=>r.grant.cityId));
 const labels=new Map<string,string>();for(const r of [...revisions].sort((a,b)=>compareEvents(a.event,b.event)))if((isSuperAdmin(actor)||permitted.has(r.city.cityId))&&!labels.has(r.city.cityId))labels.set(r.city.cityId,r.city.cityName);
 for(const h of hosted)labels.set(h.walk.revision.city.cityId,h.walk.revision.city.cityName);
 for(const id of permitted)if(!labels.has(id))labels.set(id,id);
 return [...labels].filter(([,name])=>showCityInPicker(name)).map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export type DashboardMetric={value:number|null;error?:string};
export type DashboardSummary={cities:DashboardMetric;walks:DashboardMetric;hosting:DashboardMetric;pending:DashboardMetric;checkedAt:string;nextWalks:HostedWalk[]|null;nextHosting:HostedWalk[]|null;unscheduled:DashboardCity[]|null;pendingReviews:CityRevision[]|null};
/** Overview previews are bounded; complete lists remain in their dedicated sections. */
export function upcomingPreview(walks:HostedWalk[],limit=5):HostedWalk[]{
 return [...new Map(walks.filter(h=>h.item.status!=="past").map(h=>[h.item.event.id,h])).values()]
  .sort((a,b)=>a.item.start-b.item.start||a.item.event.id.localeCompare(b.item.event.id)).slice(0,limit);
}
const failure=(reason:unknown):DashboardMetric=>({value:null,error:reason instanceof Error?reason.message:"Relay data unavailable. Refresh to retry."});
export async function loadDashboardSummary(relays:string[],actor:string,selectedCity:string):Promise<DashboardSummary>{
 const [directory,permissions,hosting]=await Promise.allSettled([queryDirectoryRecords(relays),queryAuthorizations(relays),queryHostedWalks(relays,actor)]);
 const assigned=hosting.status==="fulfilled"?hosting.value.filter(h=>(!selectedCity||h.walk.revision.city.cityId===selectedCity)&&h.item.status!=="past"):null;
 const result:DashboardSummary={cities:{value:null},walks:{value:null},hosting:assigned?{value:assigned.length}:failure(hosting.status==="rejected"?hosting.reason:"Hosting unavailable"),pending:{value:null},checkedAt:new Date().toISOString(),nextWalks:null,nextHosting:assigned?upcomingPreview(assigned):null,unscheduled:null,pendingReviews:null};
 if(directory.status==="rejected"){result.cities=failure(directory.reason);result.walks=failure(directory.reason);result.pending=failure(directory.reason);return result;}
 if(isSuperAdmin(actor)){const pending=pendingCityRevisions(directory.value.revisions,directory.value.approvals).filter(r=>!selectedCity||r.city.cityId===selectedCity);result.pending={value:pending.length};result.pendingReviews=pending.slice(0,5);}
 if(permissions.status==="rejected"){result.cities=failure(permissions.reason);result.walks=failure(permissions.reason);return result;}
 const grants=latestDashboardGrants(permissions.value);
 const cities=approvedCalendarWalks(directory.value.revisions,directory.value.approvals).filter(w=>(!selectedCity||w.revision.city.cityId===selectedCity)&&(isSuperAdmin(actor)||grants.some(r=>r.grant.cityId===w.revision.city.cityId&&canEditCity(actor,r.grant))));
 result.cities={value:cities.length};
 try{
  const scheduled:HostedWalk[]=[],unscheduled:DashboardCity[]=[];
  for(const walk of cities){
   const events=await queryCalendarEvents(relays,{cityId:walk.revision.city.cityId});
   if(events.length>=500)throw new Error("A city reached the event read limit; the total cannot be confirmed.");
   const items=managedCalendarEvents(walk,events).filter(e=>e.status!=="past");
   scheduled.push(...items.map(item=>({walk,item})));
   if(!items.length)unscheduled.push({id:walk.revision.city.cityId,name:walk.revision.city.cityName});
  }
  result.walks={value:scheduled.length};result.nextWalks=upcomingPreview(scheduled);result.unscheduled=unscheduled.sort((a,b)=>a.name.localeCompare(b.name));
 }catch(error){result.walks=failure(error);}
 return result;
}
