import type {SponsorshipPresentation} from "./sponsorship";
import type {SponsorOrder} from "../payments/sponsor-types";

export type SponsorOccurrence={id:string;address:string;start:number;end:number};
export const SPONSOR_OG_DURATION_SECONDS=12*60*60;
export type SponsorExpiry="walk-end"|"og";
/** Payment is coverage, never artwork approval: retain the signed presentation only. */
export function sponsorCoverage(selected:SponsorshipPresentation,orders:SponsorOrder[],cityId:string,occurrence?:SponsorOccurrence,now=Math.floor(Date.now()/1000),expiry:SponsorExpiry="walk-end"):SponsorshipPresentation{
 if(occurrence&&now>=(expiry==="og"?occurrence.start+SPONSOR_OG_DURATION_SECONDS:occurrence.end))return {state:"hidden"};
 if(selected.state!=="sponsor")return selected;
 if(!occurrence)return {state:"empty"};
 const purchases=orders.filter(order=>order.cityId===cityId&&order.pubkey===selected.pubkey&&order.status==="paid");
 // Existing manual assignments remain supported under the same expiry policy.
 if(!purchases.length)return selected;
 const covered=purchases.some(order=>!order.needsReview&&order.walks.length===order.count&&order.walks.some(walk=>walk.id===occurrence.id&&walk.address===occurrence.address&&walk.start===occurrence.start));
 return covered?selected:{state:"empty"};
}
