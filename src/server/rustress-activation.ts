import {lstatSync,readFileSync} from "node:fs";
import {RustressActivator,RustressProvisioner} from "../rustress/client";
import {ActivationWorkflow} from "../rustress/activation-workflow";
import {verifyCityLnurl,verifyCityNip05} from "../rustress/public-provisioning";
import {ProvisionWorkflow} from "../rustress/workflow";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {getPaymentRuntime} from "../payments/runtime";
import {resolveRustressActivationEvidence} from "./pro-setup";

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
  const db=getPaymentRuntime().store.db,reservationProvider=new RustressProvisioner(options),activationProvider=new RustressActivator(options);
  const resolve=async(request:string)=>{
    const row=db.prepare("SELECT city_id FROM city_brand_request WHERE id=? AND status='active'").get(request) as {city_id:string}|undefined;
    if(!row||!allow.has(row.city_id))throw new Error("City is not approved for managed provisioning.");
    return resolveRustressActivationEvidence(request,publicOrigin);
  };
  const reservation=new ProvisionWorkflow(db,reservationProvider,async request=>{
    const evidence=await resolve(request);return {config:evidence.reserved,proofHash:evidence.proofHash};
  },()=>Date.now(),"rustress_managed_reservation_task");
  const activation=new ActivationWorkflow(db,reservationProvider,activationProvider,{nip05:verifyCityNip05,lnurl:verifyCityLnurl},resolve);
  return {allow,db,reservation,activation,activationEnabled:process.env.BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED==="1"};
}

export async function queueManagedProvisioning(requestId:string){const service=runtime();if(service)await service.reservation.enqueue(requestId);}

async function reconcileCity(service:NonNullable<ReturnType<typeof runtime>>,city:string){
  const request=service.db.prepare("SELECT id FROM city_brand_request WHERE city_id=? AND status='active' ORDER BY rowid DESC LIMIT 1").get(city) as {id:string}|undefined;
  if(!request)return;
  if(!service.reservation.status(city)){try{await service.reservation.enqueue(request.id);}catch{return;}}
  if(service.reservation.status(city)?.state!=="verified")await service.reservation.run(city);
  if(!service.activationEnabled||service.reservation.status(city)?.state!=="verified")return;
  if(!service.activation.status(city)){try{await service.activation.enqueue(request.id);}catch{return;}}
  const current=service.activation.status(city);
  if(current?.state!=="blocked"&&(current?.state!=="active"||Date.now()-current.updatedAt>=300_000))await service.activation.run(city);
}

export async function reconcileManagedProvisioning(){
  const service=runtime();if(!service)return;
  for(const city of service.allow)await reconcileCity(service,city);
}

export function managedProvisioningStatus(city:string){const service=runtime();return service?{
  reservation:service.reservation.status(city),activation:service.activation.status(city),activationEnabled:service.activationEnabled}:null;}

export async function retryManagedProvisioning(city:string,actor:string){
  if(actor!==SUPER_ADMIN_PUBKEY)throw new Error("Super-admin provisioning recovery required.");
  const service=runtime();if(!service||!service.allow.has(city))throw new Error("Managed city provisioning is not enabled.");
  await reconcileCity(service,city);return {reservation:service.reservation.status(city),activation:service.activation.status(city),activationEnabled:service.activationEnabled};
}
