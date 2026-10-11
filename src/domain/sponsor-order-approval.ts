import type {SponsorOrder} from "../payments/sponsor-types";
import {latestSponsorships,sponsorshipKey,type SponsorshipRevision} from "../nostr/sponsorships";
import type {Sponsorship} from "./sponsorship";

export function orderLogoApproval(order:SponsorOrder,rows:SponsorshipRevision[]){
 const latest=latestSponsorships(rows);
 const approved=order.walks.filter(walk=>latest.some(row=>sponsorshipKey(row.sponsorship.scope)===`walk:${order.cityId}:${walk.address}`&&row.sponsorship.mode==="sponsor"&&row.sponsorship.sponsorPubkey===order.pubkey&&!!order.logoHash&&row.sponsorship.logoHash===order.logoHash)).length;
 return {approved,total:order.walks.length,complete:!!order.logoHash&&order.walks.length>0&&approved===order.walks.length};
}
export function orderLogoAssignments(order:SponsorOrder,rows:SponsorshipRevision[]):Sponsorship[]{
 if(order.status!=="paid"||!order.pubkey||!order.logoHash||order.needsReview||order.walks.length!==order.count||new Set(order.walks.map(w=>w.address)).size!==order.count)throw new Error("This order must be paid, linked to a sponsor and cleared for review before approving its logo.");
 const latest=latestSponsorships(rows);
 return order.walks.flatMap(walk=>{
  const current=latest.find(row=>sponsorshipKey(row.sponsorship.scope)===`walk:${order.cityId}:${walk.address}`);
  if(current?.sponsorship.mode==="sponsor"&&current.sponsorship.sponsorPubkey!==order.pubkey)throw new Error("A purchased walk is assigned to another sponsor. Review its assignment before approving this order.");
  if(current?.sponsorship.mode==="hidden")throw new Error("A purchased walk has its sponsor display hidden. Review its Display setting before approving this order.");
  if(current?.sponsorship.mode==="sponsor"&&current.sponsorship.logoHash===order.logoHash)return [];
  return [{version:2,scope:{type:"walk",cityId:order.cityId,address:walk.address},mode:"sponsor",sponsorPubkey:order.pubkey!,logoHash:order.logoHash!,...(current?{previousRevisionId:current.event.id}:{}),...(current?.sponsorship.mode==="sponsor"?{website:current.sponsorship.website,startsAt:current.sponsorship.startsAt,endsAt:current.sponsorship.endsAt}:{})}];
 });
}
