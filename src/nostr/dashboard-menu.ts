import type {DashboardRole} from "../domain/dashboard";
import {managedCalendarEvents} from "../domain/event-routing";
import {approvedCalendarWalks} from "./calendar-records";
import {canEditCity} from "./organizer-edit";
import {queryAuthorizations,queryCalendarEvents,queryDirectoryRecords,type ApprovalRecord,type AuthorizationRecord,type CityRevision} from "./city-records";
import {queryHostedWalks,type HostedWalk} from "./hosted-walks";
import {latestDashboardGrants} from "./dashboard-data";

export type DashboardMenuCounts={cities:number|null;walks:number|null};
export function retainKnownDashboardMenuCounts(current:DashboardMenuCounts,next:DashboardMenuCounts):DashboardMenuCounts{
 return {cities:next.cities??current.cities,walks:next.walks??current.walks};
}
export function hostedWalkCount(hosted:HostedWalk[]|null):number|null{
 if(hosted===null)return null;
 return new Set(hosted.filter(assignment=>assignment.item.status!=="past").map(assignment=>assignment.item.event.id)).size;
}

export async function resolveDashboardMenuCounts(relays:string[],actor:string,role:DashboardRole,grants:AuthorizationRecord[],directory:{revisions:CityRevision[];approvals:ApprovalRecord[]},hosted:HostedWalk[]|null):Promise<DashboardMenuCounts>{
 if(role==="member")return {cities:null,walks:hostedWalkCount(hosted)};
 if(role!=="super-admin"&&role!=="organizer")return {cities:null,walks:null};
 const latest=latestDashboardGrants(grants);
 const cities=approvedCalendarWalks(directory.revisions,directory.approvals).filter(walk=>role==="super-admin"||latest.some(record=>record.grant.cityId===walk.revision.city.cityId&&canEditCity(actor,record.grant)));
 try{
  const records=cities.length?await queryCalendarEvents(relays,{cityIds:cities.map(walk=>walk.revision.city.cityId)}):[];
  if(records.length>=500)throw new Error("The event inventory reached the read limit; the menu count cannot be confirmed.");
  const events=cities.map(walk=>managedCalendarEvents(walk,records).filter(item=>item.status!=="past").map(item=>item.event.id));
  if(role==="organizer"&&hosted===null)return {cities:cities.length,walks:null};
  const ids=new Set(events.flat());
  if(role==="organizer")for(const assignment of hosted??[])if(assignment.item.status!=="past")ids.add(assignment.item.event.id);
  return {cities:cities.length,walks:ids.size};
 }catch{return {cities:cities.length,walks:null};}
}

export async function loadDashboardMenuCounts(relays:string[],actor:string,role:DashboardRole):Promise<DashboardMenuCounts>{
 if(role==="disconnected")return {cities:null,walks:null};
 const [directory,grants,hosting]=await Promise.allSettled([queryDirectoryRecords(relays),queryAuthorizations(relays),queryHostedWalks(relays,actor)]);
 if(role==="member")return {cities:null,walks:hostedWalkCount(hosting.status==="fulfilled"?hosting.value:null)};
 if(directory.status==="rejected"||grants.status==="rejected")return {cities:null,walks:null};
 return resolveDashboardMenuCounts(relays,actor,role,grants.value,directory.value,hosting.status==="fulfilled"?hosting.value:null);
}
