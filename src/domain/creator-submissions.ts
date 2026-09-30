import {compareEvents} from "nostr-tools";
import type {ApprovalRecord,CityRevision} from "../nostr/city-records";

export type CreatorSubmission={cityId:string;cityName:string;slug:string;tier:"free"|"paid";revisionId:string;status:"awaiting-approval"|"approved"|"needs-changes"};
export function creatorSubmissions(pubkey:string,revisions:CityRevision[],approvals:ApprovalRecord[]):CreatorSubmission[]{
 const cities=new Map<string,CityRevision>();
 for(const revision of [...revisions].filter(item=>item.event.pubkey===pubkey).sort((a,b)=>compareEvents(a.event,b.event)))if(!cities.has(revision.city.cityId))cities.set(revision.city.cityId,revision);
 return [...cities.values()].map(revision=>{const decisions=approvals.filter(item=>item.approval.cityId===revision.city.cityId&&item.approval.cityRevisionId===revision.event.id).sort((a,b)=>compareEvents(a.event,b.event));const status:CreatorSubmission["status"]=decisions[0]?.approval.status==="approved"?"approved":decisions[0]?.approval.status==="rejected"||decisions[0]?.approval.status==="revoked"?"needs-changes":"awaiting-approval";return{cityId:revision.city.cityId,cityName:revision.city.cityName,slug:revision.city.slug,tier:revision.city.requestedTier??"free",status,revisionId:revision.event.id};}).sort((a,b)=>a.cityName.localeCompare(b.cityName));
}
