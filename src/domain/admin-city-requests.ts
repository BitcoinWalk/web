import {compareEvents} from "nostr-tools";
import type {ApprovalRecord,CityRevision} from "../nostr/city-records";
import {archivedCityIds} from "../nostr/moderation";

export const FINAL_REJECTION_PREFIX="REJECT_APPLICATION: ";

export type AdminCityRequestStatus="pending"|"accepted"|"needs-changes"|"rejected"|"archived";
export type AdminCityRequest={revision:CityRevision;decision?:ApprovalRecord;status:AdminCityRequestStatus;established:boolean};

export function isFinalApplicationRejection(note?:string):boolean{
 return note?.startsWith(FINAL_REJECTION_PREFIX)??false;
}

export function visibleDecisionNote(note?:string):string{
 return isFinalApplicationRejection(note)?note!.slice(FINAL_REJECTION_PREFIX.length):note??"";
}

/** One current application row per city. Exact revision decisions determine the
 * request state; city-wide archival always wins and is rendered separately. */
export function adminCityRequests(revisions:CityRevision[],approvals:ApprovalRecord[]):AdminCityRequest[]{
 const archived=archivedCityIds(approvals),latest=new Map<string,CityRevision>(),orderedApprovals=[...approvals].sort((a,b)=>compareEvents(a.event,b.event));
 for(const revision of [...revisions].sort((a,b)=>compareEvents(a.event,b.event)))if(!latest.has(revision.city.cityId))latest.set(revision.city.cityId,revision);
 return [...latest.values()].map(revision=>{
  const cityId=revision.city.cityId,decision=orderedApprovals.find(row=>row.approval.cityId===cityId&&row.approval.cityRevisionId===revision.event.id),established=orderedApprovals.some(row=>row.approval.cityId===cityId&&row.approval.status==="approved");
  let status:AdminCityRequestStatus="pending";
  if(archived.has(cityId))status="archived";
  else if(decision?.approval.status==="approved")status="accepted";
  else if(decision&&(decision.approval.status==="rejected"||decision.approval.status==="revoked"))status=isFinalApplicationRejection(decision.approval.note)?"rejected":"needs-changes";
  return {revision,decision,status,established};
 }).sort((a,b)=>a.status==="archived"&&b.status!=="archived"?1:b.status==="archived"&&a.status!=="archived"?-1:a.revision.city.cityName.localeCompare(b.revision.city.cityName));
}
