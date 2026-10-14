import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {cityAuthorizationSchema,cityOwnerPubkey,type CityAuthorization} from "../domain/city";
import {createAuthorizationEvent} from "./city-event";
import {parseCityDirectoryEvent,type CityDirectoryAnchor} from "./city-directory";
import type {AuthorizationRecord} from "./city-records";

export type OwnershipTransferAcceptance={version:1;requestId:string;origin:string;cityId:string;currentOwnerPubkey:string;nextOwnerPubkey:string;rotationEventId:string;issuedAt:number;expiresAt:number};

/** Recover the immutable directory anchor from the exact root event retained by
 * the activation store. Database column names are deliberately not part of the
 * public directory protocol. */
export function ownershipTransferAnchor(signedEvent:string,cityId:string):CityDirectoryAnchor{
 let event:Event;
 try{event=JSON.parse(signedEvent) as Event;}catch{throw new Error("Active city directory root is invalid.");}
 const content=parseCityDirectoryEvent(event);
 if(content.cityId!==cityId||content.sequence!==0||content.action!=="establish"||content.previousEventId!==""||event.pubkey!==content.ownerPubkey)throw new Error("Active city directory root does not match this city.");
 return {cityId,rootEventId:event.id,initialOwnerPubkey:event.pubkey};
}

export function ownershipTransferAcceptanceTemplate(input:OwnershipTransferAcceptance):EventTemplate{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.requestId)||new URL(input.origin).origin!==input.origin||!input.origin.startsWith("https://")||
  !/^[0-9a-f]{64}$/.test(input.currentOwnerPubkey)||!/^[0-9a-f]{64}$/.test(input.nextOwnerPubkey)||!/^[0-9a-f]{64}$/.test(input.rotationEventId)||
  !Number.isSafeInteger(input.issuedAt)||input.expiresAt!==input.issuedAt+7*86400)throw new Error("Invalid ownership transfer acceptance request.");
 return {kind:27235,created_at:input.issuedAt,tags:[["u",`${input.origin}/api/ownership-transfers`],["method","POST"],["t","bitcoinwalk-city-owner-acceptance-v1"]],content:JSON.stringify(input)};
}

export function verifyOwnershipTransferAcceptance(event:Event,input:OwnershipTransferAcceptance,now=Math.floor(Date.now()/1000)):Event{
 const template=ownershipTransferAcceptanceTemplate(input);
 if(now<input.issuedAt||now>=input.expiresAt)throw new Error("Ownership transfer acceptance expired.");
 if(!verifyEvent(event)||event.pubkey!==input.nextOwnerPubkey||event.kind!==template.kind||event.created_at!==template.created_at||event.content!==template.content||JSON.stringify(event.tags)!==JSON.stringify(template.tags))throw new Error("The destination owner did not sign the exact transfer acceptance.");
 return event;
}

/** Build the super-admin-signed permission successor only after the exact
 * owner-signed directory rotation and destination acceptance are verified. */
export function transferredCityAuthorization(input:{record:AuthorizationRecord;rotationEvent:Event;acceptanceEvent:Event;requestId:string;origin:string;retainEditors?:boolean;now?:number}):EventTemplate{
 const grant=cityAuthorizationSchema.parse(input.record.grant),rotation=parseCityDirectoryEvent(input.rotationEvent);
 const currentOwner=cityOwnerPubkey(grant),now=input.now??Math.floor(Date.now()/1000);
 if(rotation.action!=="rotate"||rotation.cityId!==grant.cityId||rotation.previousEventId===""||input.rotationEvent.pubkey!==currentOwner||rotation.ownerPubkey===currentOwner)throw new Error("Directory event is not the expected owner rotation.");
 verifyOwnershipTransferAcceptance(input.acceptanceEvent,{version:1,requestId:input.requestId,origin:input.origin,cityId:grant.cityId,currentOwnerPubkey:currentOwner,nextOwnerPubkey:rotation.ownerPubkey,rotationEventId:input.rotationEvent.id,issuedAt:input.acceptanceEvent.created_at,expiresAt:input.acceptanceEvent.created_at+7*86400},now);
 if(now<=input.record.event.created_at)throw new Error("Ownership permission successor must be newer than the current grant.");
 const retained=input.retainEditors?grant.editorPubkeys.filter(key=>key!==currentOwner):[];
 const successor:CityAuthorization={version:2,cityId:grant.cityId,creatorPubkey:grant.creatorPubkey,creatorRevisionId:grant.creatorRevisionId,ownerPubkey:rotation.ownerPubkey,ownershipEventId:input.rotationEvent.id,editorPubkeys:[...new Set([rotation.ownerPubkey,...retained])],superAdminPubkey:grant.superAdminPubkey};
 return {...createAuthorizationEvent(successor),created_at:now};
}
