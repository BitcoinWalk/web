import {MADEIRA_PILOT,authorizeMadeiraRequest} from "../../../nostr/madeira-pilot";
import {getMadeiraPilot,madeiraPilotEnabled} from "../../../server/madeira-pilot";
import {paymentBody} from "../../../payments/request-body";
import type {Event} from "nostr-tools";
export const dynamic="force-dynamic",runtime="nodejs";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
let busy=false;
let last=0;
export async function POST(request:Request){
  if(!madeiraPilotEnabled())return reply({error:"Private pilot is unavailable."},404);
  if(request.headers.get("origin")!==MADEIRA_PILOT.origin)return reply({error:"Wrong origin."},403);
  let input:{event:Event;proof?:Event},command:ReturnType<typeof authorizeMadeiraRequest>;
  try {input=await paymentBody(request) as typeof input;command=authorizeMadeiraRequest(input.event);}catch{return reply({error:"Sign in as BitcoinWalk in Madeira or the super-admin."},403);}
  if(busy||Date.now()-last<5000)return reply({error:"Please wait five seconds before retrying."},429);
  busy=true;last=Date.now();
  try{
    const pilot=getMadeiraPilot();
    if(command.action==="load")await pilot.store.prepare();
    if(command.action==="owner"||command.action==="admin"){
      if(!input.proof)throw new Error("Private proof is required.");
      await pilot.store.accept(command.action,input.proof);
    }
    if(command.action==="admin"||command.action==="retry")await pilot.reconcile();
    if(command.action==="managed-load")await pilot.managedStore.prepare();
    if(command.action==="managed-owner"||command.action==="managed-admin"){
      if(!input.proof)throw new Error("Managed reservation proof is required.");
      await pilot.managedStore.accept(command.action==="managed-owner"?"owner":"admin",input.proof);
    }
    if(command.action==="managed-admin"||command.action==="managed-retry")
      await (await import("../../../server/rustress-activation")).reconcileManagedProvisioning();
    if(command.action==="activation-load")await pilot.activationStore.prepare();
    if(command.action==="activation-owner"||command.action==="activation-admin"){
      if(!input.proof)throw new Error("Managed public activation proof is required.");
      await pilot.activationStore.accept(command.action==="activation-owner"?"owner":"admin",input.proof);
    }
    if(command.action==="activation-admin"||command.action==="activation-retry")
      await (await import("../../../server/rustress-activation")).reconcileManagedProvisioning();
    const managed=await import("../../../server/rustress-activation");
    return reply({pilot:pilot.store.view(),provisioning:pilot.workflow.status(MADEIRA_PILOT.cityId),managed:pilot.managedStore.view(),
      activation:pilot.activationStore.view(),managedProvisioning:managed.managedProvisioningStatus(MADEIRA_PILOT.cityId)});
  }catch(error){
    const message=error instanceof Error?error.message:"";
    return reply({error:/^(Madeira |Approve Madeira |Private pilot proof|Private proof|Both private|Existing proof|Load the pilot|Managed reservation|Managed public|Both managed|Existing managed|Complete the managed)/.test(message)?message:"Pilot verification unavailable. No invoice, profile or production settings were changed."},409);
  }finally{busy=false;}
}
