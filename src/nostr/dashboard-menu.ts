import type {DashboardRole} from "../domain/dashboard";
import {managedCalendarEvents} from "../domain/event-routing";
import {approvedCalendarWalks} from "./calendar-records";
import {canEditCity} from "./organizer-edit";
import {queryAuthorizations,queryCalendarEvents,queryDirectoryRecords,type ApprovalRecord,type AuthorizationRecord,type CityRevision} from "./city-records";
import {queryHostedWalks,type HostedWalk} from "./hosted-walks";
import {latestDashboardGrants} from "./dashboard-data";

export type DashboardMenuCounts={cities:number|null;walks:number|null};

export async function resolveDashboardMenuCounts(relays:string[],actor:string,role:DashboardRole,grants:AuthorizationRecord[],directory:{revisions:CityRevision[];approvals:ApprovalRecord[]},hosted:HostedWalk[]|null):Promise<DashboardMenuCounts>{
 if(role!=="super-admin"&&role!=="organizer")return {cities:null,walks:null};
 const latest=latestDashboardGrants(grants);
 const cities=approvedCalendarWalks(directory.revisions,directory.approvals).filter(walk=>role==="super-admin"||latest.some(record=>record.grant.cityId===walk.revision.city.cityId&&canEditCity(actor,record.grant)));
 try{
  const events=await Promise.all(cities.map(async walk=>{
   const records=await queryCalendarEvents(relays,{cityId:walk.revision.city.cityId});
   if(records.length>=500)throw new Error("A city reached the event read limit; the menu count cannot be confirmed.");
   return managedCalendarEvents(walk,records).filter(item=>item.status!=="past").map(item=>item.event.id);
  }));
  if(role==="organizer"&&hosted===null)return {cities:cities.length,walks:null};
  const ids=new Set(events.flat());
  if(role==="organizer")for(const assignment of hosted??[])if(assignment.item.status!=="past")ids.add(assignment.item.event.id);
  return {cities:cities.length,walks:ids.size};
 }catch{return {cities:cities.length,walks:null};}
}

export async function loadDashboardMenuCounts(relays:string[],actor:string,role:DashboardRole):Promise<DashboardMenuCounts>{
 if(role!=="super-admin"&&role!=="organizer")return {cities:null,walks:null};
 const [directory,grants,hosting]=await Promise.allSettled([queryDirectoryRecords(relays),queryAuthorizations(relays),queryHostedWalks(relays,actor)]);
 if(directory.status==="rejected"||grants.status==="rejected")return {cities:null,walks:null};
 return resolveDashboardMenuCounts(relays,actor,role,grants.value,directory.value,hosting.status==="fulfilled"?hosting.value:null);
}
