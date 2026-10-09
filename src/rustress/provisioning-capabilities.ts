import type {DatabaseSync} from "node:sqlite";

export type CapabilityState="setup-required"|"provisioning"|"active"|"needs-attention";
export type CityProvisioningCapabilities={overall:CapabilityState;nip05:CapabilityState;lightning:CapabilityState;retryable:boolean;detail:string};
function table(db:DatabaseSync,name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
function normalize(value:unknown):CapabilityState{return ["setup-required","provisioning","active","needs-attention"].includes(String(value))?value as CapabilityState:"needs-attention";}

/** Read-only CMS projection. Missing tables and records are setup state, never
 * proof that a provider action failed or that a capability is active. */
export function cityProvisioningCapabilities(db:DatabaseSync,cityId:string):CityProvisioningCapabilities{
  if(!table(db,"rustress_managed_reservation_task"))return {overall:"setup-required",nip05:"setup-required",lightning:"setup-required",retryable:false,
    detail:"Managed city address provisioning has not started."};
  const reservation=db.prepare("SELECT phase FROM rustress_managed_reservation_task WHERE city=?").get(cityId) as {phase:string}|undefined;
  if(!reservation)return {overall:"setup-required",nip05:"setup-required",lightning:"setup-required",retryable:false,detail:"City address setup is ready to be queued."};
  if(reservation.phase==="blocked")return {overall:"needs-attention",nip05:"needs-attention",lightning:"needs-attention",retryable:true,detail:"The private city reservation needs administrator review."};
  if(reservation.phase!=="verified")return {overall:"provisioning",nip05:"provisioning",lightning:"provisioning",retryable:["unknown"].includes(reservation.phase),
    detail:"The canonical city address is being reserved privately."};
  if(!table(db,"rustress_activation_task"))return {overall:"provisioning",nip05:"provisioning",lightning:"provisioning",retryable:false,
    detail:"Private reservation is verified; public activation has not started."};
  const active=db.prepare("SELECT phase,nip05,lnurl FROM rustress_activation_task WHERE city=?").get(cityId) as {phase:string;nip05:string;lnurl:string}|undefined;
  if(!active)return {overall:"provisioning",nip05:"provisioning",lightning:"provisioning",retryable:false,detail:"Private reservation is verified; public activation is queued separately."};
  const nip05=normalize(active.nip05),lightning=normalize(active.lnurl),overall=active.phase==="active"&&nip05==="active"&&lightning==="active"?"active":
    ["blocked","unknown","needs-attention"].includes(active.phase)||nip05==="needs-attention"||lightning==="needs-attention"?"needs-attention":"provisioning";
  return {overall,nip05,lightning,retryable:overall==="needs-attention",detail:overall==="active"?"NIP-05 and the Lightning address passed independent public verification.":
    overall==="needs-attention"?"Provisioning is preserved but needs administrator review or retry.":"Public city capabilities are being activated and independently verified."};
}
