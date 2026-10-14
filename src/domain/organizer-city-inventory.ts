import type {ApprovalRecord,AuthorizationRecord,CityRevision} from "../nostr/city-records";
import {compareEvents} from "nostr-tools";
import {correctableRejectedCityRevisions,editableCityRevisions} from "../nostr/organizer-edit";
import {creatorSubmissions,type CreatorSubmission} from "./creator-submissions";

export type OrganizerCityInventoryItem={revision:CityRevision;editable:boolean;correctable:boolean;reviewNote?:string;status:CreatorSubmission["status"]|"editable"};

/** Includes creator-owned submissions without treating visibility as edit permission. */
export function organizerCityInventory(pubkey:string,grants:AuthorizationRecord[],revisions:CityRevision[],approvals:ApprovalRecord[]):OrganizerCityInventoryItem[]{
 const editable=editableCityRevisions(pubkey,grants,revisions,approvals),correctable=new Set(correctableRejectedCityRevisions(pubkey,grants,revisions,approvals).map(revision=>revision.event.id)),items=new Map<string,OrganizerCityInventoryItem>();
 for(const revision of editable)items.set(revision.city.cityId,{revision,editable:true,correctable:false,status:"editable"});
 for(const submission of creatorSubmissions(pubkey,revisions,approvals)){
  const revision=revisions.find(item=>item.event.id===submission.revisionId);
  if(!revision)continue;
  const existing=items.get(submission.cityId);
  if(existing){
   if(existing.revision.event.id===submission.revisionId)items.set(submission.cityId,{...existing,status:submission.status});
   continue;
  }
  const review=approvals.filter(record=>record.approval.cityId===submission.cityId&&record.approval.cityRevisionId===submission.revisionId).sort((a,b)=>compareEvents(a.event,b.event))[0];
  items.set(submission.cityId,{revision,editable:false,correctable:correctable.has(submission.revisionId),reviewNote:review?.approval.note,status:submission.status});
 }
 return [...items.values()].sort((a,b)=>a.revision.city.cityName.localeCompare(b.revision.city.cityName)||a.revision.city.cityId.localeCompare(b.revision.city.cityId));
}
