import type {DatabaseSync} from "node:sqlite";
import {managedProvisionConfigSchema,type ProvisionConfig} from "../rustress/contract";
import {loopbackVirtualHostRequest,type JsonTransport} from "../rustress/loopback-http";
import {activeNamedIdentity,activePublicIdentity,activeRootIdentity,type PublicIdentity} from "../rustress/public-identity-store";
import {getPaymentRuntime} from "../payments/runtime";
import {activeStandaloneAddress} from "../rustress/standalone-address-store";

type Dependencies={db:DatabaseSync;origin:string;transport:JsonTransport;aliasTransport?:JsonTransport;nip05Enabled?:()=>boolean;lnurlEnabled?:()=>boolean;standaloneLnurlEnabled?:()=>boolean;pause?:(milliseconds:number)=>Promise<void>};
const label=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function publicCapabilityEnabled(capability:"NIP05"|"LNURL"){
  // Capability-specific switches are the production contract for every managed
  // city. Keep the old aggregate switch only for the bounded Madeira pilot.
  if(process.env[`BITCOINWALK_RUSTRESS_${capability}_ENABLED`]==="1")return true;
  return process.env.BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT==="activation-v1"&&
    process.env.BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED==="1";
}
function dependencies():Dependencies{return {db:getPaymentRuntime().store.db,origin:process.env.BITCOINWALK_RUSTRESS_MANAGED_ORIGIN??"",transport:loopbackVirtualHostRequest,
  aliasTransport:fetch,
  nip05Enabled:()=>publicCapabilityEnabled("NIP05"),lnurlEnabled:()=>publicCapabilityEnabled("LNURL"),standaloneLnurlEnabled:()=>process.env.BITCOINWALK_RUSTRESS_STANDALONE_LNURL_ENABLED==="1"};}
function activeConfig(localPart:string,capability:"nip05"|"lnurl",db:DatabaseSync):ProvisionConfig|null{
  if(!label.test(localPart)||localPart.length>63)return null;
  const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rustress_activation_task'").get();if(!table)return null;
  let rows:{activation_config:string}[];try{rows=db.prepare(`SELECT activation_config FROM rustress_activation_task WHERE (${capability}='active' OR phase='verifying') AND json_extract(activation_config,'$.localPart')=? LIMIT 2`).all(localPart) as {activation_config:string}[];}catch{return null;}
  if(rows.length!==1)return null;
  for(const row of rows){try{const config=managedProvisionConfigSchema.parse(JSON.parse(row.activation_config));if(config.localPart===localPart&&
      (capability==="nip05"||config.invoiceIssuance==="enabled"))return config;}catch{/* Corrupt rows fail closed. */}}
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
async function invoiceProvider(path:string,config:Pick<ProvisionConfig,"domain">,deps:Dependencies){
  const pause=deps.pause??(milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)));
  for(let attempt=0;attempt<3;attempt++){
    const response=await provider(path,config,deps);if(response!==null)return response;
    if(attempt<2)await pause(750*(attempt+1));
  }
  return null;
}
const headers={"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const zapAliasEndpoint="https://getalby.com/.well-known/lnurlp/bitcoinwalk";
const zapAliasCallback="https://getalby.com/lnurlp/bitcoinwalk/callback";
const zapAliasSigner="79f00d3f5a19ec806189fcab03c1be4ff81d18ee4f653c88fac41fe03570f432";
async function standaloneZapMetadata(localPart:string,providerText:string,transport:JsonTransport){
  let response:Response;try{response=await transport(zapAliasEndpoint,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),headers:{Accept:"application/json"}});}catch{return null;}
  if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type")??"")){await response.body?.cancel();return null;}
  const reader=response.body?.getReader();if(!reader)return null;const decoder=new TextDecoder();let text="",bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>65_536)return null;text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
    const value=JSON.parse(text) as Record<string,unknown>,callback=new URL(String(value.callback)),providerValue=JSON.parse(providerText) as Record<string,unknown>,providerCallback=new URL(String(providerValue.callback));
    if(value.tag!=="payRequest"||value.allowsNostr!==true||value.nostrPubkey!==zapAliasSigner||
      !Number.isSafeInteger(value.minSendable)||!Number.isSafeInteger(value.maxSendable)||Number(value.minSendable)<1||Number(value.maxSendable)<Number(value.minSendable)||
      callback.protocol!=="https:"||callback.hostname!=="getalby.com"||callback.port||callback.username||callback.password||callback.pathname!=="/lnurlp/bitcoinwalk/callback"||callback.hash)
      return null;
    const metadata=JSON.parse(String(providerValue.metadata));
    if(providerValue.tag!=="payRequest"||!Number.isSafeInteger(providerValue.minSendable)||!Number.isSafeInteger(providerValue.maxSendable)||Number(providerValue.minSendable)<1||Number(providerValue.maxSendable)<Number(providerValue.minSendable)||
      providerCallback.href!==`https://bitcoinwalk.org/lnurlp/${localPart}/callback`||!Array.isArray(metadata)||!metadata.some(row=>Array.isArray(row)&&row[0]==="text/plain"))return null;
    return {tag:"payRequest",callback:providerCallback.href,minSendable:providerValue.minSendable,maxSendable:providerValue.maxSendable,metadata:providerValue.metadata,
      allowsNostr:true,nostrPubkey:value.nostrPubkey};
  }catch{return null;}finally{await reader.cancel();}
}
async function standaloneZapInvoice(search:string,transport:JsonTransport){
  let response:Response;try{response=await transport(zapAliasCallback+search,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),headers:{Accept:"application/json"}});}catch{return null;}
  if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type")??"")){await response.body?.cancel();return null;}
  const text=await response.text();if(text.length>65_536)return null;
  try{const value=JSON.parse(text) as Record<string,unknown>;return typeof value.pr==="string"&&value.pr.toLowerCase().startsWith("lnbc")?text:null;}catch{return null;}
}
export async function managedNip05(name:string,deps=dependencies()){
  if(deps.nip05Enabled&&!deps.nip05Enabled())return Response.json({names:{}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  const root=name==="_"?activeRootIdentity(deps.db):null;
  if(root)return Response.json({names:{_:root.brandPubkey}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  const named=activeNamedIdentity(deps.db,name);
  if(named)return Response.json({names:{[name]:named.brandPubkey}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  const config:PublicIdentity|ProvisionConfig|null=activePublicIdentity(deps.db,name)??activeConfig(name,"nip05",deps.db);if(!config)return Response.json({names:{}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  const text=await provider(`/.well-known/nostr.json?name=${encodeURIComponent(name)}`,config,deps);if(!text)return Response.json({names:{}},{status:503,headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  try{const value=JSON.parse(text) as {names?:Record<string,unknown>};if(value.names?.[name]!==config.brandPubkey)throw new Error();
    return Response.json({names:{[name]:config.brandPubkey}},{headers:{...headers,"Access-Control-Allow-Origin":"*"}});
  }catch{return Response.json({names:{}},{status:503,headers:{...headers,"Access-Control-Allow-Origin":"*"}});}
}
export async function managedLnurl(localPart:string,path:string,search="",deps=dependencies()){
  const city=activeConfig(localPart,"lnurl",deps.db),standalone=city?null:activeStandaloneAddress(deps.db,localPart);
  if(city&&deps.lnurlEnabled&&!deps.lnurlEnabled()||standalone&&deps.standaloneLnurlEnabled&&!deps.standaloneLnurlEnabled())return Response.json({status:"ERROR",reason:"Address not found"},{status:404,headers});
  const config=city??standalone,allowed=path===`/.well-known/lnurlp/${localPart}`||path===`/lnurlp/${localPart}`||path.startsWith(`/lnurlp/${localPart}/`);
  if(!config||!allowed||search.length>2048||path.includes("..")||!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(path))return Response.json({status:"ERROR",reason:"Address not found"},{status:404,headers});
  if(standalone&&search===""&&(path===`/.well-known/lnurlp/${localPart}`||path===`/lnurlp/${localPart}`)){
    const providerText=await provider(path,config,deps);if(providerText===null)return Response.json({status:"ERROR",reason:"Payment service unavailable"},{status:503,headers});
    const metadata=await standaloneZapMetadata(localPart,providerText,deps.aliasTransport??fetch);
    return metadata?Response.json(metadata,{headers:{...headers,"Access-Control-Allow-Origin":"*"}}):Response.json({status:"ERROR",reason:"Payment service unavailable"},{status:503,headers});
  }
  const callback=path===`/lnurlp/${localPart}/callback`;
  if(standalone&&callback&&new URLSearchParams(search).has("nostr")){
    const text=await standaloneZapInvoice(search,deps.aliasTransport??fetch);return text===null?Response.json({status:"ERROR",reason:"Payment service unavailable"},{status:503,headers}):new Response(text,{headers});
  }
  const text=await (callback?invoiceProvider(path+search,config,deps):provider(path+search,config,deps));return text===null?Response.json({status:"ERROR",reason:"Payment service unavailable"},{status:503,headers}):new Response(text,{headers});
}
export const gatewayTest={activeConfig,publicCapabilityEnabled,loopbackTransport:loopbackVirtualHostRequest,standaloneZapMetadata,standaloneZapInvoice,invoiceProvider};
