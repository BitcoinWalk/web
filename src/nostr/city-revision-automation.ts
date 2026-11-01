import {compareEvents,type EventTemplate} from "nostr-tools";
import type {CityAuthorization,CityDocument} from "../domain/city";
import type {CityRevision} from "./city-records";
import {createApprovalEvent} from "./city-event";
import type {ManagedCity} from "./moderation";
import {AUTOMATED_CITY_REVISION_NOTE} from "./city-revision-automation-contract";

const protectedFields:Array<keyof CityDocument>=["cityId","slug","cityName","countryCode","locale","aliases","requestedTier","initialWalkStarts","chatUrl","heroImageUrl","sponsor"];
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);

/** Build the only decision the revision worker may sign. Everything else stays in Requests. */
export function automatedCityRevisionDecision(input:{current:ManagedCity;revision:CityRevision;grant:CityAuthorization;citySuspended:boolean;organizerSuspended:boolean;now?:number}):EventTemplate{
 const {current,revision,grant}=input,city=revision.city,previous=current.revision.city;
 if(current.state!=="approved"||current.decision.approval.status!=="approved"||current.head!==current.decision.event.id)throw new Error("Current city approval is not an unmoderated active head.");
 if(input.citySuspended||input.organizerSuspended)throw new Error("Suspended cities and organizers require manual review.");
 if(city.cityId!==previous.cityId||grant.cityId!==city.cityId||!grant.editorPubkeys.includes(revision.event.pubkey))throw new Error("Current city editor authority does not match this revision.");
 const predecessors=revision.event.tags.filter(tag=>tag[0]==="e"&&tag[3]==="previous");
 if(predecessors.length!==1||predecessors[0][1]!==current.revision.event.id)throw new Error("Revision does not directly follow the current approved city.");
 if(revision.event.tags.some(tag=>tag[0]==="e"&&tag[3]==="initial-walk"))throw new Error("First-walk changes require manual review.");
 if(compareEvents(revision.event,current.revision.event)>=0)throw new Error("Revision is not newer than the current approved city.");
 if(protectedFields.some(field=>!same(previous[field],city[field])))throw new Error("Revision changes a protected city field.");
 if(same(previous.startAt,city.startAt)&&same(previous.description,city.description)&&same(previous.meetingPoint,city.meetingPoint))throw new Error("Revision has no eligible content change.");
 const createdAt=Math.max(input.now??Math.floor(Date.now()/1000),revision.event.created_at+1,current.decision.event.created_at+1);
 return {...createApprovalEvent({cityId:city.cityId,cityRevisionId:revision.event.id,status:"approved",note:AUTOMATED_CITY_REVISION_NOTE}),created_at:createdAt};
}
