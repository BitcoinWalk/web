import type { PaidDirectoryCity } from "../domain/directory";

// Operator-confirmed legacy entitlements only. Neither requestedTier, a sponsor
// nor an organizer's chat URL is proof of payment. New settled app purchases
// remain in the payment ledger; staging pilots are never promoted by this list.
export const directoryConfig:{paidCities:Record<string,PaidDirectoryCity>}={paidCities:{
  "ca20993a-5b7f-443e-931e-8dbaa61d05fe":{slug:"madeira",cityName:"Madeira",featured:false,subdomainReady:false,relayMode:"dedicated"},
  "ca2f9905-fb4d-4948-a12c-c792b28ec7c8":{slug:"london",cityName:"London",featured:false,subdomainReady:true,relayMode:"migrated"},
  "8e136ccb-923b-41aa-a6d1-1290b0b3a014":{slug:"wuerzburg",cityName:"Würzburg",aliases:["wurzburg"],featured:false,subdomainReady:false,relayMode:"dedicated"},
  "e62592ac-a5fc-42df-8f31-94416f6ee8d5":{slug:"graz",cityName:"Graz",featured:false,subdomainReady:false,relayMode:"dedicated"},
  "d42123e1-1d01-473b-98e7-846342150eca":{slug:"hannover",cityName:"Hannover",aliases:["hanover"],featured:false,subdomainReady:false,relayMode:"dedicated"},
}};

// Exact staging fixtures retained only long enough to publish a signed retirement.
// They never qualify as production paid-city inventory.
export const stagingTestCityIds=new Set([
 "52c6c6c2-ece9-4780-8364-6d3c00638f42", // Radom
 "5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd", // Islamabad
]);

const comparable=(value:string)=>value.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim();
export function configuredPaidCityEntry(cityId:string,slugs:string[]=[]):{cityId:string;city:PaidDirectoryCity}|undefined{
 const exact=directoryConfig.paidCities[cityId];if(exact)return {cityId,city:exact};
 const candidates=new Set(slugs.map(comparable));
 const match=Object.entries(directoryConfig.paidCities).find(([,city])=>[city.slug,...(city.aliases??[])].some(slug=>candidates.has(comparable(slug))));
 return match?{cityId:match[0],city:match[1]}:undefined;
}
export function configuredPaidCity(cityId:string,slugs:string[]=[]):PaidDirectoryCity|undefined{
 return configuredPaidCityEntry(cityId,slugs)?.city;
}
