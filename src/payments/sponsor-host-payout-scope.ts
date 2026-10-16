import {z} from "zod";

const cityId=z.uuid();

export type SponsorHostPayoutScope={enabled:boolean;cityIds:ReadonlySet<string>};

/** Host-share invitations are independently scoped from the payout worker.
 * A missing or malformed city allowlist disables the feature without affecting
 * ordinary sponsorship checkout, city zaps or the super-admin audit. */
export function sponsorHostPayoutScope(environment:Record<string,string|undefined>=process.env):SponsorHostPayoutScope{
 if(environment.BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED!=="1")return {enabled:false,cityIds:new Set()};
 const values=(environment.BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS??"").split(",").map(value=>value.trim()).filter(Boolean),parsed=z.array(cityId).min(1).max(10).safeParse(values);
 if(!parsed.success||new Set(parsed.data).size!==parsed.data.length)return {enabled:false,cityIds:new Set()};
 return {enabled:true,cityIds:new Set(parsed.data)};
}
