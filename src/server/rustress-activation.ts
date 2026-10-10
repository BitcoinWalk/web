import {lstatSync,readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {RustressActivator,RustressProvisioner} from "../rustress/client";
import {ActivationWorkflow} from "../rustress/activation-workflow";
import {PayoutUpdateWorkflow} from "../rustress/payout-update-workflow";
import {verifyCityLnurl,verifyCityNip05} from "../rustress/public-provisioning";
import {ProvisionWorkflow} from "../rustress/workflow";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {getPaymentRuntime} from "../payments/runtime";
import {resolveRustressActivationEvidence,resolveRustressPayoutUpdateEvidence} from "./pro-setup";
import {MADEIRA_PILOT} from "../nostr/madeira-pilot";
import {createCityActivation} from "../rustress/activation-contract";
import {provisionConfigSchema,provisionDigest} from "../rustress/contract";
import {canonicalLoopbackTransport,loopbackApiTransport} from "../rustress/loopback-http";

const cityId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function privateToken(path:string){
  if(!path.startsWith("/"))throw new Error("Private managed provisioning token file required.");
  const stat=lstatSync(path);if(!stat.isFile()||stat.mode&0o077||stat.size>1024)throw new Error("Private managed provisioning token file required.");
  return readFileSync(/* turbopackIgnore: true */ path,"utf8").trim();
}

/** Managed reservation and activation are separate operator gates. Selecting or
 * paying for Pro enables neither one. All network clients remain loopback-only. */
function runtime(){
  if(process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED!=="1")return null;
  const allow=new Set((process.env.BITCOINWALK_RUSTRESS_MANAGED_CITIES??"").split(",").filter(Boolean));
  if(!allow.size||allow.size>10||[...allow].some(value=>!cityId.test(value)))throw new Error("Managed provisioning city allow-list required.");
  const options={origin:process.env.BITCOINWALK_RUSTRESS_MANAGED_ORIGIN??"",
    token:privateToken(process.env.BITCOINWALK_RUSTRESS_MANAGED_TOKEN_FILE??""),domain:"bitcoinwalk.org",
    adapterRevision:process.env.BITCOINWALK_RUSTRESS_MANAGED_REVISION??""};
  const publicOrigin=process.env.BITCOINWALK_RUSTRESS_PUBLIC_ORIGIN??"";
  if(publicOrigin!=="https://bitcoinwalk.org")throw new Error("Canonical managed public origin required.");
  const madeiraMode=process.env.BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT??"",madeiraBridge=["reservation-v1","activation-v1"].includes(madeiraMode);
  const activationEnabled=process.env.BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED==="1";
  if(madeiraBridge&&(!allow.has(MADEIRA_PILOT.cityId)||allow.size!==1))throw new Error("Managed Madeira pilot requires its exact city allow-list.");
  if(madeiraBridge&&activationEnabled&&madeiraMode!=="activation-v1")throw new Error("Managed Madeira public activation requires its separate activation mode.");
  // Every managed origin is loopback-only. Preserve the reviewed virtual host
  // for both the Madeira bridge and generic allow-listed city provisioning.
  const providerTransport=loopbackApiTransport(options.origin,options.domain);
  const db=getPaymentRuntime().store.db,reservationProvider=new RustressProvisioner(options,providerTransport),activationProvider=new RustressActivator(options,providerTransport);
  const resolveRegular=async(request:string,current?:import("../rustress/contract").ProvisionConfig)=>{
    const row=db.prepare("SELECT city_id FROM city_brand_request WHERE id=? AND status='active'").get(request) as {city_id:string}|undefined;
    if(row&&allow.has(row.city_id))return resolveRustressActivationEvidence(request,publicOrigin,current);
    throw new Error("City is not approved for managed provisioning.");
  };
  const resolveReservation=async(request:string)=>{
    if(!madeiraBridge)return resolveRegular(request);
    const evidence=await (await import("./madeira-pilot")).getMadeiraPilot().managedStore.evidence(request);
    const reserved=provisionConfigSchema.parse(evidence.config),activation=createCityActivation(reserved);
    return {reserved,activation,publicOrigin,proofHash:createHash("sha256").update(JSON.stringify({reservationProof:evidence.proofHash,
      reserved:provisionDigest(reserved),activation:provisionDigest(activation)})).digest("hex")};
  };
  const resolveActivation=async(request:string,current?:import("../rustress/contract").ProvisionConfig)=>madeiraBridge&&(!current||current.version===2)?
    (await import("./madeira-pilot")).getMadeiraPilot().activationStore.evidence(request):resolveRegular(request,current);
  const reservation=new ProvisionWorkflow(db,reservationProvider,async request=>{
    try {
      const evidence=await resolveReservation(request);return {config:evidence.reserved,proofHash:evidence.proofHash};
    } catch(error) {
      console.warn(`Managed reservation evidence deferred: ${managedReservationPreflightReason(error)}.`);
      throw error;
    }
  },()=>Date.now(),"rustress_managed_reservation_task");
  const publicTransport=madeiraMode==="activation-v1"?canonicalLoopbackTransport(options.origin,options.domain):fetch;
  const activation=new ActivationWorkflow(db,reservationProvider,activationProvider,
    {nip05:input=>verifyCityNip05(input,publicTransport),lnurl:input=>verifyCityLnurl(input,publicTransport)},resolveActivation);
  const payoutUpdates=new PayoutUpdateWorkflow(db,activationProvider,
    {nip05:input=>verifyCityNip05(input,publicTransport),lnurl:input=>verifyCityLnurl(input,publicTransport)},
    (request,current)=>resolveRustressPayoutUpdateEvidence(request,current,publicOrigin));
  return {allow,db,reservation,activation,payoutUpdates,activationEnabled,madeiraBridge};
}

export async function queueManagedProvisioning(requestId:string){const service=runtime();if(service)await service.reservation.enqueue(requestId);}

export function managedReservationPreflightReason(error:unknown){
  const message=error instanceof Error?error.message:"";
  if(error instanceof Error&&error.name==="ZodError")return "generated provider configuration is invalid";
  if(message.includes("approved city")||message.includes("creator authorization"))return "city approval evidence unavailable";
  if(message.includes("settled Pro entitlement")||message.includes("payment record"))return "Pro entitlement evidence unavailable";
  if(message.includes("publishing is suspended"))return "city or organizer is suspended";
  if(message.includes("signer, payout or artwork changed"))return "city profile evidence changed";
  if(message.includes("ownership, approval or entitlement changed"))return "city authority changed after identity approval";
  if(message.includes("account request not found"))return "city identity request is missing";
  if(message.includes("approval was superseded")||message.includes("Binding was superseded"))return "city identity binding was superseded";
  if(message.includes("active before provisioning"))return "city identity is not active";
  if(message.includes("publication relay"))return "city identity publication relay is not configured";
  if(message.includes("read-back")||message.includes("Directory history")||message.includes("Could not read the relay"))return "city identity relay read-back is incomplete";
  if(message.includes("payout confirmation")||message.includes("personal destination")||message.includes("payment loop")||message.includes("Lightning endpoint")||message.includes("ENOTFOUND")||message.includes("Invalid URL"))return "payout evidence is unavailable";
  if(message.includes("provisioning evidence changed"))return "city provisioning evidence changed during verification";
  return "authorization evidence is unavailable";
}

async function reconcileCity(service:NonNullable<ReturnType<typeof runtime>>,city:string){
  let request=service.db.prepare("SELECT id FROM city_brand_request WHERE city_id=? AND status='active' ORDER BY rowid DESC LIMIT 1").get(city) as {id:string}|undefined;
  if(!request&&service.madeiraBridge&&city===MADEIRA_PILOT.cityId){
    const view=(await import("./madeira-pilot")).getMadeiraPilot().managedStore.view();
    if(view?.ownerConfirmed&&view.adminConfirmed)request={id:view.challenge.requestId};
  }
  if(!request)return;
  if(!service.reservation.status(city)){try{
    if(service.madeiraBridge&&city===MADEIRA_PILOT.cityId){
      const evidence=(await import("./madeira-pilot")).getMadeiraPilot().managedStore.storedEvidence(request.id);
      service.reservation.enqueueEvidence(request.id,evidence);
    }else await service.reservation.enqueue(request.id);
   }catch(error){console.warn(`Managed reservation preflight deferred for ${city}: ${managedReservationPreflightReason(error)}.`);return;}}
  if(service.reservation.status(city)?.state!=="verified")await service.reservation.run(city);
  if(!service.activationEnabled||service.reservation.status(city)?.state!=="verified")return;
  let activationRequest=request;
  if(service.madeiraBridge&&city===MADEIRA_PILOT.cityId){
    const view=(await import("./madeira-pilot")).getMadeiraPilot().activationStore.view();
    if(!view?.ownerConfirmed||!view.adminConfirmed)return;activationRequest={id:view.challenge.requestId};
  }
  if(!service.activation.status(city)){try{await service.activation.enqueue(activationRequest.id);}catch{return;}}
  const current=service.activation.status(city);
  if(current?.state!=="blocked"&&(current?.state!=="active"||Date.now()-current.updatedAt>=300_000))await service.activation.run(city);
  if(service.activation.status(city)?.state==="active"){
    const active=service.db.prepare("SELECT json_extract(activation_config,'$.payoutVersion') payoutVersion FROM rustress_activation_task WHERE city=?").get(city) as {payoutVersion:number}|undefined;
    const latest=service.db.prepare("SELECT MAX(version) payoutVersion FROM payout_destination_version WHERE city_id=?").get(city) as {payoutVersion:number|null};
    const known=service.payoutUpdates.status(city);
    if(active&&latest.payoutVersion!==null&&latest.payoutVersion>active.payoutVersion&&(!known||known.state==="active"&&known.payoutVersion<latest.payoutVersion)){
      try{await service.payoutUpdates.enqueue(request.id);}catch(error){console.warn(`Managed payout update deferred for ${city}: ${managedReservationPreflightReason(error)}.`);}
    }
    const update=service.payoutUpdates.status(city);if(update&&update.state!=="active"&&update.state!=="blocked")await service.payoutUpdates.run(city);
  }
}

export async function reconcileManagedProvisioning(){
  const service=runtime();if(!service)return;
  for(const city of service.allow)await reconcileCity(service,city);
}

export function managedProvisioningStatus(city:string){const service=runtime();return service?{
  reservation:service.reservation.status(city),activation:service.activation.status(city),payoutUpdate:service.payoutUpdates.status(city),activationEnabled:service.activationEnabled}:null;}

export async function queueManagedPayoutUpdate(city:string){const service=runtime();if(!service||!service.allow.has(city))return null;
 const request=service.db.prepare("SELECT id FROM city_brand_request WHERE city_id=? AND status='active' ORDER BY rowid DESC LIMIT 1").get(city) as {id:string}|undefined;
 if(!request)return null;await service.payoutUpdates.enqueue(request.id);return service.payoutUpdates.status(city);}

export async function retryManagedProvisioning(city:string,actor:string){
  if(actor!==SUPER_ADMIN_PUBKEY)throw new Error("Super-admin provisioning recovery required.");
  const service=runtime();if(!service||!service.allow.has(city))throw new Error("Managed city provisioning is not enabled.");
  await reconcileCity(service,city);const update=service.payoutUpdates.status(city);if(update&&update.state!=="active")await service.payoutUpdates.retry(city);
  return {reservation:service.reservation.status(city),activation:service.activation.status(city),payoutUpdate:service.payoutUpdates.status(city),activationEnabled:service.activationEnabled};
}
