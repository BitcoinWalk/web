import {latestSponsorships,sponsorshipKey,type SponsorshipRevision} from "../nostr/sponsorships";

/** Keep hidden placements manageable, but do not resurrect cleared assignments. */
export function sponsorManagementIndex(rows:SponsorshipRevision[]){
 const latest=new Map(latestSponsorships(rows).map(row=>[sponsorshipKey(row.sponsorship.scope),row.sponsorship]));
 const previousSponsors=new Map(latestSponsorships(rows.filter(row=>row.sponsorship.mode==="sponsor")).map(row=>[sponsorshipKey(row.sponsorship.scope),row.sponsorship.sponsorPubkey]));
 return (cityId:string,address?:string)=>{
  const cityKey=`city:${cityId}`,walkKey=`walk:${cityId}:${address}`,walk=address?latest.get(walkKey):undefined;
  const key=walk&&walk.mode!=="inherit"?walkKey:cityKey,value=latest.get(key);
  return {value,sponsorPubkey:value?.sponsorPubkey??(value?.mode==="hidden"?previousSponsors.get(key):undefined)};
 };
}
