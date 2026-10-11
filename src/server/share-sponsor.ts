import {serverReadRelays} from "../lib/server-relay-config";
import {querySponsorships} from "../nostr/sponsorships";
import type {Event} from "nostr-tools";
import {publicSponsorship} from "./public-sponsorship";
import {readSponsorLogoAsset} from "./sponsor-logo-store";

export async function shareSponsor(cityId:string,event?:Event|null):Promise<Buffer|null>{
 try{
  // The module visibility switch does not undo an administrator's signed OG
  // approval. Hidden assignments, payment coverage and expiry still apply.
  const relays=serverReadRelays();
  const selected=publicSponsorship(await querySponsorships(relays),true,cityId,event,undefined,"og");
  return selected.state==="sponsor"&&selected.logoHash?await readSponsorLogoAsset(selected.logoHash):null;
 }catch{return null;}
}
