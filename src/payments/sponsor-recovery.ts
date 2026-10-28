import type {SponsorOrder} from "./sponsor-types";

export const SPONSOR_CHECKOUT_STORAGE="bitcoinwalk-sponsor-checkout-v1";
export type SponsorRecovery={token:string;id:string;cityId:string;count:number;ids:string[];invitationToken?:string;scope?:"regional"|"global";selections?:Array<{cityId:string;ids:string[]}>};

export function parseSponsorRecovery(raw:string|null):SponsorRecovery|null{
 if(!raw)return null;
 try{
  const value=JSON.parse(raw) as Partial<SponsorRecovery>;
  const batch=value.scope==="regional"||value.scope==="global",selections=value.selections;
  if(!/^[a-f0-9]{64}$/.test(value.token??"")||!/^[-a-f0-9]{36}$/.test(value.id??"")||!/^[-a-f0-9]{36}$/.test(value.cityId??"")||!Number.isSafeInteger(value.count)||value.count!<1||!Array.isArray(value.ids)||value.ids.length!==value.count||new Set(value.ids).size!==value.ids.length||value.ids.some(id=>!/^[a-f0-9]{64}$/.test(id))||value.invitationToken!==undefined&&!/^[a-f0-9]{64}$/.test(value.invitationToken)||!batch&&![1,2,5].includes(value.count!)||batch&&(!Array.isArray(selections)||selections.length<2||selections.some(selection=>!/^[-a-f0-9]{36}$/.test(selection.cityId)||!Array.isArray(selection.ids)||!selection.ids.length)))return null;
  return {token:value.token!,id:value.id!,cityId:value.cityId!,count:value.count!,ids:value.ids,...(value.invitationToken?{invitationToken:value.invitationToken}:{}),...(batch?{scope:value.scope,selections}:{})};
 }catch{return null;}
}

export function recoveryForOrder(raw:string|null,order:SponsorOrder):SponsorRecovery|null{
 const value=parseSponsorRecovery(raw);
 if(!value||value.id!==order.id||value.cityId!==order.cityId||value.count!==order.count||value.scope!==undefined&&value.scope!==order.campaignScope)return null;
 const expected=order.walks.map(walk=>walk.id).sort(),actual=[...value.ids].sort();
 return JSON.stringify(expected)===JSON.stringify(actual)?value:null;
}
