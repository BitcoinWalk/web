export const AUTOMATED_CITY_REVISION_NOTE = "AUTOMATED_CITY_REVISION: approved content-only editor revision";

export function cityRevisionAutomationPubkey(superAdmin:string):string|undefined{
 const value=process.env.NEXT_PUBLIC_CITY_REVISION_AUTOMATION_PUBKEY?.trim();
 return value&&/^[0-9a-f]{64}$/.test(value)&&value!==superAdmin?value:undefined;
}
