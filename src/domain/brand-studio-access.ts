import type {ApprovalRecord,AuthorizationRecord,CityRevision} from "../nostr/city-records";
import {isSuperAdmin} from "../nostr/authority";
import {latestCityGrants} from "../nostr/editor-management";
import {managedCities} from "../nostr/moderation";

export type BrandStudioAccess={allowed:boolean;role:"super-admin"|"organizer"|"none";cities:string[]};

/** The postcard studio is for BitcoinWalk operators, never all authenticated users.
 * Editors and sponsors are intentionally excluded unless they also own an approved city. */
export function brandStudioAccess(pubkey:string,revisions:CityRevision[],approvals:ApprovalRecord[],authorizations:AuthorizationRecord[]):BrandStudioAccess{
 if(isSuperAdmin(pubkey))return {allowed:true,role:"super-admin",cities:[]};
 const grants=new Map(latestCityGrants(authorizations).map(record=>[record.grant.cityId,record.grant]));
 const cities=managedCities(revisions,approvals).filter(row=>row.state==="approved"&&(grants.get(row.revision.city.cityId)?.creatorPubkey===pubkey||(!grants.has(row.revision.city.cityId)&&row.revision.event.pubkey===pubkey))).map(row=>row.revision.city.cityName).sort((a,b)=>a.localeCompare(b));
 return {allowed:cities.length>0,role:cities.length?"organizer":"none",cities};
}
