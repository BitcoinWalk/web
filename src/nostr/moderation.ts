import {compareEvents,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {isSuperAdmin} from "./authority";
import type {ApprovalRecord,CityRevision} from "./city-records";
export const ARCHIVE_NOTE="ARCHIVE_FREE_CITY: Hide this free-tier city and its calendar; retain ownership, editors and history. No relay infrastructure is deleted.";
/** Archive is city-wide, independent of which revision an editor can load. */
export function archivedCityIds(approvals:ApprovalRecord[]):Set<string>{
 const seen=new Set<string>(),archived=new Set<string>();
 for(const {approval} of [...approvals].sort((a,b)=>compareEvents(a.event,b.event))){
  if(approval.status==="rejected"||seen.has(approval.cityId))continue;
  seen.add(approval.cityId);
  if(approval.status==="revoked"&&approval.note===ARCHIVE_NOTE)archived.add(approval.cityId);
 }
 return archived;
}
export type ManagedCity={revision:CityRevision;decision:ApprovalRecord;head:string;state:"approved"|"disapproved"|"archived"};
export function visibleManagedCities(rows:ManagedCity[],showArchived=false):ManagedCity[]{
 return rows.filter(row=>showArchived||row.state!=="archived");
}
export function managedCities(revisions:CityRevision[],approvals:ApprovalRecord[]):ManagedCity[]{
 const ordered=[...approvals].sort((a,b)=>compareEvents(a.event,b.event));
 const seen=new Set<string>();const result:ManagedCity[]=[];
 for(const decision of ordered){const a=decision.approval;if(a.status==="rejected"||seen.has(a.cityId))continue;seen.add(a.cityId);
  const revision=revisions.find(r=>r.city.cityId===a.cityId&&r.event.id===a.cityRevisionId);if(!revision)continue;
  // A later rejection of this same revision hides it under the existing resolver.
  const rejected=ordered.some(d=>d.approval.cityId===a.cityId&&d.approval.cityRevisionId===a.cityRevisionId&&d.approval.status==="rejected"&&compareEvents(d.event,decision.event)<0);
  result.push({revision,decision,head:ordered.find(d=>d.approval.cityId===a.cityId)!.event.id,state:a.status==="approved"&&!rejected?"approved":a.note===ARCHIVE_NOTE?"archived":"disapproved"});
 }return result.sort((a,b)=>a.revision.city.cityName.localeCompare(b.revision.city.cityName));
}
export function assertExactSigned(signed:Event,template:EventTemplate){
 if(!isSuperAdmin(signed.pubkey)||!verifyEvent(signed)||signed.kind!==template.kind||signed.created_at!==template.created_at||signed.content!==template.content||JSON.stringify(signed.tags)!==JSON.stringify(template.tags))throw new Error("Signer returned a different identity or event. Nothing published.");
}
export function createCalendarDeletion(event:Event,cityId:string):EventTemplate{
 if(event.kind!==31923||!verifyEvent(event)||event.tags.filter(t=>t[0]==="i").length!==1||!event.tags.some(t=>t[0]==="i"&&t[1]===cityId))throw new Error("Invalid calendar deletion target.");
 return {kind:5,created_at:Math.floor(Date.now()/1000),tags:[["e",event.id],["k","31923"],["i",cityId]],content:`DELETE PUBLISHED WALK EVENT ${event.id} for city ${cityId}. Remove this event from public relay reads. Keep the city and its approval. External copies may remain.`};
}
export function createOrganizerCancellation(event:Event,cityId:string,author:string):EventTemplate{
 if(event.pubkey!==author)throw new Error("Only the signer of this walk can cancel it. A super-admin can moderate it from /admin.");
 const deletion=createCalendarDeletion(event,cityId);
 return {...deletion,content:`CANCEL WALK EVENT ${event.id} for city ${cityId}. Remove this occurrence from BitcoinWalk. The city and other dates remain. External copies may remain.`};
}
