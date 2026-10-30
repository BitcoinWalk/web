import {compareEvents} from "nostr-tools";
import type {ApprovalRecord,CityRevision} from "../nostr/city-records";
import {archivedCityIds,deletedCityIds} from "../nostr/moderation";
import type {NeedsChangesCity} from "../nostr/moderation";
import {createApprovalEvent} from "../nostr/city-event";
import type {EventTemplate} from "nostr-tools";

export const FINAL_REJECTION_PREFIX="REJECT_APPLICATION: ";
export const SILENT_ACTIVE_OVERRIDE_NOTE="SUPER_ADMIN_ACTIVE_OVERRIDE: approve the exact current revision without organizer notification or provisioning";

export type AdminCityRequestStatus="pending"|"accepted"|"needs-changes"|"rejected"|"archived";
export type AdminCityRequest={revision:CityRevision;decision?:ApprovalRecord;status:AdminCityRequestStatus;established:boolean};

function cityIdentityKeys(revision:CityRevision):Set<string>{
 const city=revision.city,normalize=(value:string)=>value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/g," ");
 return new Set([`slug:${normalize(city.slug)}`,`name:${normalize(city.cityName)}`]);
}

/** Find an already-established public city represented by a separate request. */
export function matchingExistingCity(application:AdminCityRequest,rows:AdminCityRequest[]):CityRevision|undefined{
 const keys=cityIdentityKeys(application.revision);
 return rows.find(candidate=>candidate.revision.city.cityId!==application.revision.city.cityId&&candidate.established&&candidate.status!=="archived"&&[...cityIdentityKeys(candidate.revision)].some(key=>keys.has(key)))?.revision;
}

export function duplicateCityRejectionNote(existing:Pick<CityRevision["city"],"cityName"|"slug">):string{
 return `A BitcoinWalk already exists in ${existing.cityName}. Please join the existing city at https://bitcoinwalk.org/${encodeURIComponent(existing.slug)} or contact its organizers instead of creating a duplicate city.`;
}

export function isFinalApplicationRejection(note?:string):boolean{
 return note?.startsWith(FINAL_REJECTION_PREFIX)??false;
}

export function isSilentActiveOverride(note?:string):boolean{
 return note===SILENT_ACTIVE_OVERRIDE_NOTE;
}

export function visibleDecisionNote(note?:string):string{
 if(isSilentActiveOverride(note))return "Activated as-is by the super-admin. No organizer resubmission was required.";
 return isFinalApplicationRejection(note)?note!.slice(FINAL_REJECTION_PREFIX.length):note??"";
}

/** Approve the exact rejected revision without manufacturing any setup state.
 * The marker lets notification and provisioning consumers preserve silence. */
export function createSilentActiveOverrideDecision(row:NeedsChangesCity):EventTemplate{
 const city=row.revision.city,initial=(row.revision.event.tags??[]).filter(tag=>tag[0]==="e"&&tag[3]==="initial-walk").map(tag=>tag[1]);
 if(row.rejection.approval.cityId!==city.cityId||row.rejection.approval.cityRevisionId!==row.revision.event.id||!['rejected','revoked'].includes(row.rejection.approval.status))throw new Error("Needs changes decision no longer matches this city revision.");
 return createApprovalEvent({cityId:city.cityId,cityRevisionId:row.revision.event.id,status:"approved",note:SILENT_ACTIVE_OVERRIDE_NOTE,slug:city.slug,aliases:city.aliases??[],...(city.heroImageUrl?{heroImageUrl:city.heroImageUrl}:{}),...(initial.length===1?{initialEventId:initial[0]}:initial.length?{initialEventIds:initial}:{})});
}

/** One current application row per city. Exact revision decisions determine the
 * request state; city-wide archival always wins and is rendered separately. */
export function adminCityRequests(revisions:CityRevision[],approvals:ApprovalRecord[]):AdminCityRequest[]{
 const archived=archivedCityIds(approvals),deleted=deletedCityIds(approvals),latest=new Map<string,CityRevision>(),orderedApprovals=[...approvals].sort((a,b)=>compareEvents(a.event,b.event));
 for(const revision of [...revisions].sort((a,b)=>compareEvents(a.event,b.event)))if(!latest.has(revision.city.cityId))latest.set(revision.city.cityId,revision);
 return [...latest.values()].filter(revision=>!deleted.has(revision.city.cityId)).map(revision=>{
  const cityId=revision.city.cityId,decision=orderedApprovals.find(row=>row.approval.cityId===cityId&&row.approval.cityRevisionId===revision.event.id),established=orderedApprovals.some(row=>row.approval.cityId===cityId&&row.approval.status==="approved");
  let status:AdminCityRequestStatus="pending";
  if(archived.has(cityId))status="archived";
  else if(decision?.approval.status==="approved")status="accepted";
  else if(decision&&(decision.approval.status==="rejected"||decision.approval.status==="revoked"))status=isFinalApplicationRejection(decision.approval.note)?"rejected":"needs-changes";
  return {revision,decision,status,established};
 }).sort((a,b)=>a.status==="archived"&&b.status!=="archived"?1:b.status==="archived"&&a.status!=="archived"?-1:a.revision.city.cityName.localeCompare(b.revision.city.cityName));
}
