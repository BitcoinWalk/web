export const AUTOMATED_NEW_CITY_NOTE = "AUTOMATED_NEW_CITY: approved exact signed first walk series";
export const AUTOMATED_NEW_CITY_MARKER = "bitcoinwalk-new-city-automation-v1";
export const RETAINED_STAGING_NEW_CITY_AUTOMATION_PUBKEY = "f2d3c5dab98dfcd6c7da495ccb4a0713dd7014b507e4f18493bf4f9a70eb4408";

export function newCityAutomationPubkey(superAdmin:string):string|undefined{
 const value=process.env.NEXT_PUBLIC_NEW_CITY_AUTOMATION_PUBKEY?.trim();
 return value&&/^[0-9a-f]{64}$/.test(value)&&value!==superAdmin?value:undefined;
}

export function newCityAutomationAuthorities(superAdmin:string):string[]{
 const configured=newCityAutomationPubkey(superAdmin),retained=process.env.NEXT_PUBLIC_DEPLOYMENT_PROFILE==="production"?undefined:RETAINED_STAGING_NEW_CITY_AUTOMATION_PUBKEY;
 return [...new Set([configured,retained].filter((value):value is string=>!!value&&value!==superAdmin))];
}
