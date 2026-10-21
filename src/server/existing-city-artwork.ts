import {queryRelayEvents} from "../nostr/city-records";
import {parsePublicProfile,profileRelays,safeProfilePicture,verifyNip05} from "../nostr/profiles";

/** Reuse existing signed profile artwork, not a replacement account or an
 * acknowledgement of recovery/payment setup. Require independent relay evidence. */
export async function existingCityArtwork(pubkey:string,cityName:string,slug:string,origin:string,
 relays=profileRelays,read=queryRelayEvents,verify=verifyNip05){
 if(!await verify(pubkey,`${slug}@${new URL(origin).hostname}`))return null;
 const results=await Promise.all([...new Set(relays)].map(async relay=>{
  try{
   const events=await read([relay],[0],undefined,{authors:[pubkey],limit:20});
   const event=events.filter(e=>e.pubkey===pubkey).sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id))[0];
   if(!event)return null;
   const profile=parsePublicProfile(event,new Set([pubkey]));
   if(!profile?.picture||profile.website!==`${origin}/${slug}`||![`BitcoinWalk ${cityName}`,`BitcoinWalk in ${cityName}`].includes(profile.name??""))return null;
   const banner=safeProfilePicture(JSON.parse(event.content).banner)??profile.picture;
   return {id:event.id,avatar:{url:profile.picture},banner:{url:banner}};
  }catch{return null;}
 }));
 return results.find(row=>row&&results.filter(other=>other?.id===row.id).length>=2)??null;
}
