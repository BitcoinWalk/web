import {serverReadRelays} from "../lib/server-relay-config";
import {resolvedFeatureFlags} from "../nostr/feature-flags";
import {querySponsorships,resolveSponsorship} from "../nostr/sponsorships";
import {readSponsorLogoAsset} from "./sponsor-logo-store";

export async function shareSponsor(cityId:string,walkAddress?:string|null):Promise<Buffer|null>{
 try{
  const relays=serverReadRelays(),flags=await resolvedFeatureFlags(relays);
  if(!flags.sponsorships)return null;
  const selected=resolveSponsorship(await querySponsorships(relays),true,cityId,walkAddress);
  return selected.state==="sponsor"&&selected.logoHash?await readSponsorLogoAsset(selected.logoHash):null;
 }catch{return null;}
}
