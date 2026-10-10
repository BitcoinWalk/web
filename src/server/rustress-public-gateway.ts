import type {DatabaseSync} from "node:sqlite";
import {managedProvisionConfigSchema,type ProvisionConfig} from "../rustress/contract";
import {loopbackVirtualHostRequest,type JsonTransport} from "../rustress/loopback-http";
import {activeNamedIdentity,activePublicIdentity,activeRootIdentity,type PublicIdentity} from "../rustress/public-identity-store";
import {getPaymentRuntime} from "../payments/runtime";
import {activeStandaloneAddress} from "../rustress/standalone-address-store";

type Dependencies={db:DatabaseSync;origin:string;transport:JsonTransport;nip05Enabled?:()=>boolean;lnurlEnabled?:()=>boolean;standaloneLnurlEnabled?:()=>boolean};
const label=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function publicCapabilityEnabled(capability:"NIP05"|"LNURL"){
  if(process.env.BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT!=="activation-v1")return false;
  return process.env[`BITCOINWALK_RUSTRESS_${capability}_ENABLED`]==="1"||process.env.BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED==="1";
}
function dependencies():Dependencies{return {db:getPaymentRuntime().store.db,origin:process.env.BITCOINWALK_RUSTRESS_MANAGED_ORIGIN??"",transport:loopbackVirtualHostRequest,
  nip05Enabled:()=>publicCapabilityEnabled("NIP05"),lnurlEnabled:()=>publicCapabilityEnabled("LNURL"),standaloneLnurlEnabled:()=>process.env.BITCOINWALK_RUSTRESS_STANDALONE_LNURL_ENABLED==="1"};}
function activeConfig(localPart:string,db:DatabaseSync):ProvisionConfig|null{
  if(!label.test(localPart)||localPart.length>63)return null;
  const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rustress_activation_task'").get();if(!table)return null;
  let rows:{activation_config:string}[];try{rows=db.prepare("SELECT activation_config FROM rustress_activation_task WHERE phase IN ('verifying','needs-attention','active') AND json_extract(activation_config,'$.localPart')=? LIMIT 2").all(localPart) as {activation_config:string}[];}catch{return null;}
  if(rows.length!==1)return null;
  for(const row of rows){try{const config=managedProvisionConfigSchema.parse(JSON.parse(row.activation_config));if(config.invoiceIssuance==="enabled"&&config.localPart===localPart)return config;}catch{/* Corrupt rows fail closed. */}}
  return null;
}
function privateOrigin(value:string){
  const url=new URL(value);if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||!url.port||url.pathname!=="/"||url.search||url.hash||url.username||url.password)throw new Error();return url.origin;
}
async function provider(path:string,config:Pick<ProvisionConfig,"domain">,deps:Dependencies){
  let response:Response;try{response=await deps.transport(privateOrigin(deps.origin)+path,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
    headers:{Accept:"application/json",Host:config.domain}});}catch{return null;}
  if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type")??"")){await response.body?.cancel();return null;}
  const reader=response.body?.getReader();if(!reader)return null;const decoder=new TextDecoder();let text="",bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>65_536)return null;text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();JSON.parse(text);return text;}
  catch{return null;}finally{await reader.cancel();}
}
const headers={"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
export async function managedNip05(name:string,deps=dependencies()){
  if(deps.nip05Enabled&&!deps.nip05Enabled())return Response.json({names:{}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  const root=name==="_"?activeRootIdentity(deps.db):null;
  if(root)return Response.json({names:{_:root.brandPubkey}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  const named=activeNamedIdentity(deps.db,name);
  if(named)return Response.json({names:{[name]:named.brandPubkey}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  const config:PublicIdentity|ProvisionConfig|null=activePublicIdentity(deps.db,name)??activeConfig(name,deps.db);if(!config)return Response.json({names:{}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  const text=await provider(`/.well-known/nostr.json?name=${encodeURIComponent(name)}`,config,deps);if(!text)return Response.json({names:{}},{status:503,headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  try{const value=JSON.parse(text) as {names?:Record<string,unknown>};if(value.names?.[name]!==config.brandPubkey)throw new Error();
    return Response.json({names:{[name]:config.brandPubkey}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  }catch{return Response.json({names:{}},{status:503,headers:{...headers,"Access-Control-Allow-Origin":"*"}});}
}
export async function managedLnurl(localPart:string,path:string,search="",deps=dependencies()){
  const city=activeConfig(localPart,deps.db),standalone=city?null:activeStandaloneAddress(deps.db,localPart);
  if(city&&deps.lnurlEnabled&&!deps.lnurlEnabled()||standalone&&deps.standaloneLnurlEnabled&&!deps.standaloneLnurlEnabled())return Response.json({status:"ERROR",reason:"Address not found"},{status:404,headers});
  const config=city??standalone,allowed=path===`/.well-known/lnurlp/${localPart}`||path===`/lnurlp/${localPart}`||path.startsWith(`/lnurlp/${localPart}/`);
  if(!config||!allowed||search.length>2048||path.includes("..")||!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(path))return Response.json({status:"ERROR",reason:"Address not found"},{status:404,headers});
  const text=await provider(path+search,config,deps);return text===null?Response.json({status:"ERROR",reason:"Payment service unavailable"},{status:503,headers}):new Response(text,{headers});
}
export const gatewayTest={activeConfig,publicCapabilityEnabled,loopbackTransport:loopbackVirtualHostRequest};
