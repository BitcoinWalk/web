export type RegistrationHandoff={cityId:string;cityName:string;tier:"free"|"paid";paymentVerified:boolean};
let handoff:RegistrationHandoff|null=null;
export function setRegistrationHandoff(value:RegistrationHandoff){handoff=value;}
export function takeRegistrationHandoff(){const value=handoff;handoff=null;return value;}
export function registrationDashboardHref(cityId:string){return `/admin?submitted=${encodeURIComponent(cityId)}`;}
