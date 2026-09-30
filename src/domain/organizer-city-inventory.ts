import type {ApprovalRecord,AuthorizationRecord,CityRevision} from "../nostr/city-records";
import {editableCityRevisions} from "../nostr/organizer-edit";
import {creatorSubmissions,type CreatorSubmission} from "./creator-submissions";

export type OrganizerCityInventoryItem={revision:CityRevision;editable:boolean;status:CreatorSubmission["status"]|"editable"};

/** Includes creator-owned submissions without treating visibility as edit permission. */
export function organizerCityInventory(pubkey:string,grants:AuthorizationRecord[],revisions:CityRevision[],approvals:ApprovalRecord[]):OrganizerCityInventoryItem[]{
 const editable=editableCityRevisions(pubkey,grants,revisions,approvals),items=new Map<string,OrganizerCityInventoryItem>();
 for(const revision of editable)items.set(revision.city.cityId,{revision,editable:true,status:"editable"});
 for(const submission of creatorSubmissions(pubkey,revisions,approvals)){
  const revision=revisions.find(item=>item.event.id===submission.revisionId);
  if(!revision)continue;
  const existing=items.get(submission.cityId);
  if(existing){
   if(existing.revision.event.id===submission.revisionId)items.set(submission.cityId,{...existing,status:submission.status});
   continue;
  }
  items.set(submission.cityId,{revision,editable:false,status:submission.status});
 }
 return [...items.values()].sort((a,b)=>a.revision.city.cityName.localeCompare(b.revision.city.cityName)||a.revision.city.cityId.localeCompare(b.revision.city.cityId));
}
