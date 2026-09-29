import {compareEvents} from "nostr-tools";
import type {AuthorizationRecord,CityRevision} from "../nostr/city-records";
import {isSuperAdmin} from "../nostr/authority";
import {latestCityGrants} from "../nostr/editor-management";

export type OrganizerDirectoryEntry={pubkey:string;createdCities:string[];editorCities:string[]};

export function organizerDirectory(records:AuthorizationRecord[],revisions:CityRevision[],selectedCity=""):OrganizerDirectoryEntry[]{
 const names=new Map<string,string>();
 for(const revision of [...revisions].sort((a,b)=>compareEvents(a.event,b.event)))if(!names.has(revision.city.cityId))names.set(revision.city.cityId,revision.city.cityName);
 const entries=new Map<string,{created:Set<string>;edited:Set<string>}>();
 const add=(pubkey:string,type:"created"|"edited",city:string)=>{const entry=entries.get(pubkey)??{created:new Set<string>(),edited:new Set<string>()};entry[type].add(city);entries.set(pubkey,entry);};
 for(const {grant} of latestCityGrants(records)){
  if(selectedCity&&grant.cityId!==selectedCity)continue;
  const city=names.get(grant.cityId)??grant.cityId;
  add(grant.creatorPubkey,"created",city);
  for(const pubkey of grant.editorPubkeys)if(pubkey!==grant.creatorPubkey&&!isSuperAdmin(pubkey))add(pubkey,"edited",city);
 }
 return [...entries].map(([pubkey,value])=>({pubkey,createdCities:[...value.created].sort(),editorCities:[...value.edited].sort()})).sort((a,b)=>(a.createdCities[0]??a.editorCities[0]??a.pubkey).localeCompare(b.createdCities[0]??b.editorCities[0]??b.pubkey));
}
