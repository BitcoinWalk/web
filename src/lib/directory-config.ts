import type { PaidDirectoryCity } from "../domain/directory";

// Operator-confirmed legacy entitlements only. Neither requestedTier, a sponsor
// nor an organizer's chat URL is proof of payment. New settled app purchases
// remain in the payment ledger; staging pilots are never promoted by this list.
export const directoryConfig:{paidCities:Record<string,PaidDirectoryCity>}={paidCities:{
  "ca2f9905-fb4d-4948-a12c-c792b28ec7c8":{slug:"london",cityName:"London",featured:false,subdomainReady:true},
  "8e136ccb-923b-41aa-a6d1-1290b0b3a014":{slug:"wuerzburg",cityName:"Würzburg",aliases:["wurzburg"],featured:false,subdomainReady:false},
}};

const comparable=(value:string)=>value.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim();
export function configuredPaidCity(cityId:string,slugs:string[]=[]):PaidDirectoryCity|undefined{
 const exact=directoryConfig.paidCities[cityId];if(exact)return exact;
 const candidates=new Set(slugs.map(comparable));
 return Object.values(directoryConfig.paidCities).find(city=>[city.slug,...(city.aliases??[])].some(slug=>candidates.has(comparable(slug))));
}
