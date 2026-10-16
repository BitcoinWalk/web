import {z} from "zod";

const cityId=z.uuid();

export type SponsorHostPayoutScope={enabled:boolean;allProCities:boolean;cityIds:ReadonlySet<string>;allows:(cityId:string)=>boolean};

/** Host-share invitations are independently scoped from the payout worker.
 * A missing or malformed city allowlist disables the feature without affecting
 * ordinary sponsorship checkout, city zaps or the super-admin audit. */
export function sponsorHostPayoutScope(environment:Record<string,string|undefined>=process.env):SponsorHostPayoutScope{
 const none=()=>({enabled:false,allProCities:false,cityIds:new Set<string>(),allows:()=>false});
 if(environment.BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED!=="1")return none();
 const configured=(environment.BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS??"").trim();
 if(configured==="*")return {enabled:true,allProCities:true,cityIds:new Set(),allows:()=>true};
 const values=configured.split(",").map(value=>value.trim()).filter(Boolean),parsed=z.array(cityId).min(1).max(100).safeParse(values);
 if(!parsed.success||new Set(parsed.data).size!==parsed.data.length)return none();
 const cityIds=new Set(parsed.data);return {enabled:true,allProCities:false,cityIds,allows:(value:string)=>cityIds.has(value)};
}
