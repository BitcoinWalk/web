import {queryAuthorizations,queryDirectoryRecords} from "../nostr/city-records";
import {latestCityGrants} from "../nostr/editor-management";
import {managedCities} from "../nostr/moderation";
import {cityOwnerPubkey} from "../domain/city";
import {serverReadRelays} from "../lib/server-relay-config";

export type OrganizerChatInvitation={ownerPubkey:string;cityNames:string[]};

/** Guide-safe current-owner projection. Original creators and editors are
 * deliberately excluded; a transfer immediately changes this recipient set. */
export async function listOrganizerChatInvitations():Promise<OrganizerChatInvitation[]> {
 const relays=serverReadRelays(),[{revisions,approvals},authorizations]=await Promise.all([queryDirectoryRecords(relays),queryAuthorizations(relays)]);
 const grants=new Map(latestCityGrants(authorizations).map(record=>[record.grant.cityId,record.grant]));
 const owners=new Map<string,Set<string>>();
 for(const row of managedCities(revisions,approvals).filter(city=>city.state==="approved")){
  const grant=grants.get(row.revision.city.cityId);if(!grant)continue;
  const ownerPubkey=cityOwnerPubkey(grant);if(!/^[0-9a-f]{64}$/.test(ownerPubkey))continue;
  const names=owners.get(ownerPubkey)??new Set<string>();names.add(row.revision.city.cityName);owners.set(ownerPubkey,names);
 }
 return [...owners].map(([ownerPubkey,names])=>({ownerPubkey,cityNames:[...names].sort((a,b)=>a.localeCompare(b))})).sort((a,b)=>a.ownerPubkey.localeCompare(b.ownerPubkey));
}
