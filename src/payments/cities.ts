import {compareEvents} from "nostr-tools";
import {queryDirectoryRecords,queryCityAuthorization} from "../nostr/city-records";
import type {VerifiedCity} from "./service";
import {managedCities} from "../nostr/moderation";

export async function verifyPurchasableCity(relays:string[],cityId:string,revisionId:string):Promise<VerifiedCity>{
 const [{revisions,approvals},authorization]=await Promise.all([queryDirectoryRecords(relays),queryCityAuthorization(relays,cityId)]);
 const cityRevisions=revisions.filter(r=>r.city.cityId===cityId).sort((a,b)=>compareEvents(a.event,b.event));
 const revision=cityRevisions.find(r=>r.event.id===revisionId);
 if(!revision||revision.city.requestedTier!=="paid")throw new Error("A published signed Pro plan request is required.");
 const owner=authorization?.grant.creatorPubkey??cityRevisions.at(-1)?.event.pubkey;
 if(!owner||revision.event.pubkey!==owner)throw new Error("Only the city creator can purchase this plan.");
 const decisions=approvals.filter(r=>r.approval.cityId===cityId).sort((a,b)=>compareEvents(a.event,b.event));
 const currentLifecycle=decisions.find(r=>r.approval.status!=="rejected")?.approval;
 if(currentLifecycle?.status==="revoked"||decisions.some(r=>r.approval.cityRevisionId===revisionId&&r.approval.status==="rejected"))throw new Error("This city request is revoked or rejected and cannot be purchased.");
 return{cityId,cityName:revision.city.cityName,owner,revisionId};
}

/** Public gift eligibility is stricter than merely knowing a city id: it must
 * still be the exact current approved Basic revision and its durable creator is
 * always the beneficiary. The payer never becomes owner. */
export async function verifyGiftableCity(relays:string[],cityId:string,revisionId:string):Promise<VerifiedCity>{
 const [{revisions,approvals},authorization]=await Promise.all([queryDirectoryRecords(relays),queryCityAuthorization(relays,cityId)]);
 const current=managedCities(revisions,approvals).find(row=>row.state==="approved"&&row.revision.city.cityId===cityId);
 if(!current||current.revision.event.id!==revisionId||current.revision.city.requestedTier!=="free")throw new Error("Only the current approved Basic city can be upgraded.");
 const owner=authorization?.grant.creatorPubkey;
 if(!owner)throw new Error("The city owner could not be verified.");
 return {cityId,cityName:current.revision.city.cityName,owner,revisionId};
}
