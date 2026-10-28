export type RegistrationHandoff={cityId:string;cityName:string;tier:"free"|"paid";paymentVerified:boolean};
let handoff:RegistrationHandoff|null=null;
export function setRegistrationHandoff(value:RegistrationHandoff){handoff=value;}
export function takeRegistrationHandoff(){const value=handoff;handoff=null;return value;}
export function registrationDashboardHref(cityId:string){return `/admin?submitted=${encodeURIComponent(cityId)}`;}
export function registrationHandoffNextHref(value:RegistrationHandoff){
 const city=`/admin/my-cities?city=${encodeURIComponent(value.cityId)}`;
 return value.tier==="paid"&&value.paymentVerified?`${city}#pro-city-services`:city;
}
