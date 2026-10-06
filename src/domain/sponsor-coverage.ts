import type {SponsorshipPresentation} from "./sponsorship";
import type {SponsorOrder} from "../payments/sponsor-types";

export type SponsorOccurrence={id:string;address:string;start:number;end:number};
/** Payment is coverage, never artwork approval: retain the signed presentation only. */
export function sponsorCoverage(selected:SponsorshipPresentation,orders:SponsorOrder[],cityId:string,occurrence?:SponsorOccurrence,now=Math.floor(Date.now()/1000)):SponsorshipPresentation{
 if(occurrence&&now>=occurrence.end)return {state:"hidden"};
 if(selected.state!=="sponsor")return selected;
 if(!occurrence)return {state:"empty"};
 const purchases=orders.filter(order=>order.cityId===cityId&&order.pubkey===selected.pubkey&&order.status==="paid");
 // Existing manually approved sponsorships remain supported, but expire on the walk too.
 if(!purchases.length)return selected;
 const covered=purchases.some(order=>!order.needsReview&&order.walks.length===order.count&&order.walks.some(walk=>walk.id===occurrence.id&&walk.address===occurrence.address&&walk.start===occurrence.start));
 return covered?selected:{state:"empty"};
}
