import type {SponsorOrder} from "./sponsor-types";

export const SPONSOR_CHECKOUT_STORAGE="bitcoinwalk-sponsor-checkout-v1";
export type SponsorRecovery={token:string;id:string;cityId:string;count:number;ids:string[];invitationToken?:string};

export function parseSponsorRecovery(raw:string|null):SponsorRecovery|null{
 if(!raw)return null;
 try{
  const value=JSON.parse(raw) as Partial<SponsorRecovery>;
  if(!/^[a-f0-9]{64}$/.test(value.token??"")||!/^[-a-f0-9]{36}$/.test(value.id??"")||!/^[-a-f0-9]{36}$/.test(value.cityId??"")||![1,2,5].includes(value.count??0)||!Array.isArray(value.ids)||value.ids.length!==value.count||new Set(value.ids).size!==value.ids.length||value.ids.some(id=>!/^[a-f0-9]{64}$/.test(id))||value.invitationToken!==undefined&&!/^[a-f0-9]{64}$/.test(value.invitationToken))return null;
  return {token:value.token!,id:value.id!,cityId:value.cityId!,count:value.count!,ids:value.ids,...(value.invitationToken?{invitationToken:value.invitationToken}:{})};
 }catch{return null;}
}

export function recoveryForOrder(raw:string|null,order:SponsorOrder):SponsorRecovery|null{
 const value=parseSponsorRecovery(raw);
 if(!value||value.id!==order.id||value.cityId!==order.cityId||value.count!==order.count)return null;
 const expected=order.walks.map(walk=>walk.id).sort(),actual=[...value.ids].sort();
 return JSON.stringify(expected)===JSON.stringify(actual)?value:null;
}
