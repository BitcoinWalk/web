import {serverReadRelays} from "../lib/server-relay-config";
import {resolvedFeatureFlags} from "../nostr/feature-flags";
import {querySponsorships} from "../nostr/sponsorships";
import type {Event} from "nostr-tools";
import {publicSponsorship} from "./public-sponsorship";
import {readSponsorLogoAsset} from "./sponsor-logo-store";

export async function shareSponsor(cityId:string,event?:Event|null):Promise<Buffer|null>{
 try{
  const relays=serverReadRelays(),flags=await resolvedFeatureFlags(relays);
  if(!flags.sponsorships)return null;
  const selected=publicSponsorship(await querySponsorships(relays),true,cityId,event);
  return selected.state==="sponsor"&&selected.logoHash?await readSponsorLogoAsset(selected.logoHash):null;
 }catch{return null;}
}
