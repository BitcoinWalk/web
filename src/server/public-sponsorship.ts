import type {Event} from "nostr-tools";
import {calendarOccurrence} from "../nostr/calendar-records";
import {calendarAddress,resolveSponsorship,type SponsorshipRevision} from "../nostr/sponsorships";
import {sponsorCoverage} from "../domain/sponsor-coverage";
import type {SponsorshipPresentation} from "../domain/sponsorship";
import {getPaymentRuntime} from "../payments/runtime";

/** Shared by page modules and OG rendering; failures cannot extend paid coverage. */
export function publicSponsorship(rows:SponsorshipRevision[],enabled:boolean,cityId:string,event?:Event|null,now=Math.floor(Date.now()/1000)):SponsorshipPresentation{
 if(!enabled)return {state:"hidden"};
 const address=event?calendarAddress(event):null,dates=event?calendarOccurrence(event):null;
 if(event&&(!address||!dates||dates.end<=dates.start))return {state:"hidden"};
 const selected=resolveSponsorship(rows,true,cityId,address,now);
 try{
  if(selected.state==="sponsor"&&!process.env.BITCOINWALK_PAYMENT_DATABASE)return {state:"hidden"};
  const orders=selected.state==="sponsor"?getPaymentRuntime().sponsors.list():[];
  return sponsorCoverage(selected,orders,cityId,event&&address&&dates?{id:event.id,address,...dates}:undefined,now);
 }catch{return {state:"hidden"};}
}
