import {authorizedRelayProvisionWorker} from "../../../../relay-provisioning/auth";
import {getRelayProvisionStore} from "../../../../relay-provisioning/runtime";
import type {RelayProvisionEvidence} from "../../../../relay-provisioning/store";

export const dynamic="force-dynamic",runtime="nodejs";
const noStore={"Cache-Control":"no-store"};
export async function GET(request:Request){
 if(!authorizedRelayProvisionWorker(request))return Response.json({error:"Not authorized."},{status:401,headers:noStore});
 try{const store=getRelayProvisionStore(),task=store.claim();if(!task)return new Response(null,{status:204,headers:noStore});return Response.json({manifest:store.manifest(task),leaseUntil:task.leaseUntil},{headers:noStore});}
 catch{return Response.json({error:"Provisioning queue unavailable."},{status:503,headers:noStore});}
}
export async function POST(request:Request){
 if(!authorizedRelayProvisionWorker(request))return Response.json({error:"Not authorized."},{status:401,headers:noStore});
 try{
  const body=await request.json() as {cityId?:unknown;evidenceDigest?:unknown;phase?:unknown;evidence?:unknown;failureCode?:unknown};
  if(typeof body.cityId!=="string"||typeof body.evidenceDigest!=="string")throw new Error();
  const store=getRelayProvisionStore();
  const task=body.phase==="provisioned"?store.complete(body.cityId,body.evidenceDigest,{phase:"provisioned",evidence:body.evidence as RelayProvisionEvidence}):
   body.phase==="needs-attention"&&typeof body.failureCode==="string"?store.complete(body.cityId,body.evidenceDigest,{phase:"needs-attention",failureCode:body.failureCode}):(()=>{throw new Error();})();
  return Response.json({cityId:task.cityId,phase:task.phase},{headers:noStore});
 }catch{return Response.json({error:"Provisioning result was rejected."},{status:409,headers:noStore});}
}
