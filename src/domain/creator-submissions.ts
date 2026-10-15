import {compareEvents} from "nostr-tools";
import type {ApprovalRecord,CityRevision} from "../nostr/city-records";
import {archivedCityIds,deletedCityIds} from "../nostr/moderation";
import {isFinalApplicationRejection} from "./admin-city-requests";

export type CreatorSubmission={cityId:string;cityName:string;slug:string;tier:"free"|"paid";revisionId:string;status:"awaiting-approval"|"approved"|"needs-changes"|"rejected"|"archived"};
export function creatorSubmissions(pubkey:string,revisions:CityRevision[],approvals:ApprovalRecord[]):CreatorSubmission[]{
 const cities=new Map<string,CityRevision>(),archived=archivedCityIds(approvals),deleted=deletedCityIds(approvals);
 for(const revision of [...revisions].filter(item=>item.event.pubkey===pubkey).sort((a,b)=>compareEvents(a.event,b.event)))if(!cities.has(revision.city.cityId))cities.set(revision.city.cityId,revision);
 return [...cities.values()].filter(revision=>!deleted.has(revision.city.cityId)).map(revision=>{const decisions=approvals.filter(item=>item.approval.cityId===revision.city.cityId&&item.approval.cityRevisionId===revision.event.id).sort((a,b)=>compareEvents(a.event,b.event)),decision=decisions[0];const status:CreatorSubmission["status"]=archived.has(revision.city.cityId)?"archived":decision?.approval.status==="approved"?"approved":decision&&(decision.approval.status==="rejected"||decision.approval.status==="revoked")?isFinalApplicationRejection(decision.approval.note)?"rejected":"needs-changes":"awaiting-approval";return{cityId:revision.city.cityId,cityName:revision.city.cityName,slug:revision.city.slug,tier:revision.city.requestedTier??"free",status,revisionId:revision.event.id};}).sort((a,b)=>a.cityName.localeCompare(b.cityName));
}
