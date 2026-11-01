export const AUTOMATED_NEW_CITY_NOTE = "AUTOMATED_NEW_CITY: approved exact signed first walk series";
export const AUTOMATED_NEW_CITY_MARKER = "bitcoinwalk-new-city-automation-v1";

export function newCityAutomationPubkey(superAdmin:string):string|undefined{
 const value=process.env.NEXT_PUBLIC_NEW_CITY_AUTOMATION_PUBKEY?.trim();
 return value&&/^[0-9a-f]{64}$/.test(value)&&value!==superAdmin?value:undefined;
}
