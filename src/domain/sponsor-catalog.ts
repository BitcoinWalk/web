import {latestSponsorships,sponsorshipKey,type SponsorshipRevision} from "../nostr/sponsorships";
export function sponsorCatalog(rows:SponsorshipRevision[]){
 const entries=new Map<string,{pubkey:string;website:string;logoHash?:string;cityId:string;scopeKey:string}>();
 for(const {sponsorship:value} of latestSponsorships(rows)){
  if(value.mode!=="sponsor"||!value.sponsorPubkey||entries.has(value.sponsorPubkey))continue;
  entries.set(value.sponsorPubkey,{pubkey:value.sponsorPubkey,website:value.website??"",logoHash:value.logoHash,cityId:value.scope.cityId,scopeKey:sponsorshipKey(value.scope)});
 }
 return [...entries.values()];
}
