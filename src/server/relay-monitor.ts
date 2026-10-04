import {lookup} from "node:dns/promises";
import {connect as tlsConnect} from "node:tls";
import type {ReplicationStatus} from "./replication-status";

export type CheckState="ok"|"failed"|"timeout"|"malformed"|"unknown";
export type RelayRagStatus="green"|"amber"|"red"|"unknown";
export type RelayCheckEvidence={dns:CheckState;tls:CheckState;https:CheckState;wss:CheckState;nip11:CheckState;nip11Name?:string;supportedNips?:number[]};
export type ManagedRelay={url:string;purpose:string;environment:"staging"|"production";cityId?:string;replication?:{state:"healthy"|"pending"|"degraded";reconciled:boolean;counts:Record<string,number>}};
export type RelayMonitorItem=ManagedRelay&RelayCheckEvidence&{status:RelayRagStatus;checkedAt:string};
export type RelayMonitorReport={checkedAt:string;stale:boolean;relays:RelayMonitorItem[]};

function normalized(value:string){const url=new URL(value);url.pathname="/";url.search="";url.hash="";return url.href;}
function environment(url:string):ManagedRelay["environment"]{return new URL(url).hostname.includes("staging")?"staging":"production";}
export function buildManagedRelayInventory(input:{application:readonly string[];directory:readonly string[];community:readonly string[];replication?:ReplicationStatus}):ManagedRelay[]{
 const rows=new Map<string,ManagedRelay>();
 const add=(url:string,purpose:string,extra:Partial<ManagedRelay>={})=>{const key=normalized(url),existing=rows.get(key);rows.set(key,{url:key,purpose:existing&&existing.purpose!==purpose?`${existing.purpose}, ${purpose}`:purpose,environment:environment(key),...existing,...extra});};
 input.application.forEach(url=>add(url,"Application relay"));
 input.directory.forEach(url=>add(url,"Directory transport"));
 input.community.forEach(url=>add(url,"Community relay"));
 input.replication?.cities.forEach(city=>add(city.destination,"City replica",{cityId:city.cityId,replication:{state:city.state,reconciled:input.replication!.reconciled,counts:city.counts}}));
 return [...rows.values()].sort((a,b)=>a.url.localeCompare(b.url));
}

export function classifyRelayEvidence(evidence:RelayCheckEvidence):RelayRagStatus{
 const values=[evidence.dns,evidence.tls,evidence.https,evidence.wss,evidence.nip11];
 if(values.every(value=>value==="unknown"))return "unknown";
 if(values.every(value=>value==="ok"))return "green";
 if(evidence.dns==="failed"||([evidence.tls,evidence.https,evidence.wss].every(value=>value==="failed"||value==="timeout")))return "red";
 return "amber";
}

async function settle(check:()=>Promise<unknown>):Promise<CheckState>{try{await check();return "ok";}catch(error){return error instanceof Error&&error.name==="TimeoutError"?"timeout":"failed";}}
function timeout(ms:number):AbortSignal{return AbortSignal.timeout(ms);}
async function checkTls(hostname:string,ms:number){await new Promise<void>((resolve,reject)=>{const socket=tlsConnect({host:hostname,port:443,servername:hostname,rejectUnauthorized:true},()=>{const certificate=socket.getPeerCertificate();if(!socket.authorized||!certificate.valid_to||Date.parse(certificate.valid_to)<=Date.now())reject(new Error("TLS certificate rejected"));else resolve();socket.end();});socket.setTimeout(ms,()=>{const error=new Error("TLS timeout");error.name="TimeoutError";socket.destroy(error);});socket.on("error",reject);});}
async function checkWebSocket(url:string,ms:number){await new Promise<void>((resolve,reject)=>{let finished=false;const socket=new WebSocket(url);const timer=setTimeout(()=>{if(finished)return;finished=true;socket.close();const error=new Error("WebSocket timeout");error.name="TimeoutError";reject(error);},ms);socket.addEventListener("open",()=>{if(finished)return;finished=true;clearTimeout(timer);socket.close();resolve();},{once:true});socket.addEventListener("error",()=>{if(finished)return;finished=true;clearTimeout(timer);reject(new Error("WebSocket unavailable"));},{once:true});});}

export async function inspectRelay(relay:ManagedRelay,timeoutMs=3000):Promise<RelayCheckEvidence>{
 const url=new URL(relay.url),httpsURL=new URL(url.href);httpsURL.protocol="https:";
 const [dns,tls,https,wss,nip11Result]=await Promise.all([
  settle(async()=>{await lookup(url.hostname);}),
  settle(()=>checkTls(url.hostname,timeoutMs)),
  settle(async()=>{const response=await fetch(new URL("/healthz",httpsURL),{cache:"no-store",signal:timeout(timeoutMs)});if(!response.ok)throw new Error("Health unavailable");}),
  settle(()=>checkWebSocket(relay.url,timeoutMs)),
  (async()=>{try{const response=await fetch(new URL("/",httpsURL),{headers:{Accept:"application/nostr+json"},cache:"no-store",signal:timeout(timeoutMs)});if(!response.ok)return {state:"failed" as CheckState};const value=await response.json() as {name?:unknown;supported_nips?:unknown};if(typeof value.name!=="string"||!value.name.trim()||!Array.isArray(value.supported_nips)||!value.supported_nips.every(item=>Number.isInteger(item)))return {state:"malformed" as CheckState};return {state:"ok" as CheckState,name:value.name,nips:value.supported_nips as number[]};}catch(error){return {state:error instanceof Error&&error.name==="TimeoutError"?"timeout":"failed" as CheckState};}})(),
 ]);
 return {dns,tls,https,wss,nip11:nip11Result.state,...(nip11Result.name?{nip11Name:nip11Result.name,supportedNips:nip11Result.nips}: {})};
}

async function mapLimit<T,R>(items:T[],limit:number,work:(item:T)=>Promise<R>):Promise<R[]>{const output=new Array<R>(items.length);let cursor=0;async function worker(){while(cursor<items.length){const index=cursor++;output[index]=await work(items[index]);}}await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},worker));return output;}
export async function monitorRelays(inventory:ManagedRelay[],options:{inspect?:(relay:ManagedRelay)=>Promise<RelayCheckEvidence>;now?:()=>Date;concurrency?:number}={}):Promise<RelayMonitorReport>{
 const now=options.now?.()??new Date(),inspect=options.inspect??inspectRelay;
 const relays=await mapLimit(inventory,options.concurrency??3,async relay=>{let evidence:RelayCheckEvidence;try{evidence=await inspect(relay);}catch{evidence={dns:"unknown",tls:"unknown",https:"unknown",wss:"unknown",nip11:"unknown"};}let status=classifyRelayEvidence(evidence);if(status==="green"&&relay.replication?.state!==undefined&&(!relay.replication.reconciled||relay.replication.state!=="healthy"))status="amber";return {...relay,...evidence,status,checkedAt:now.toISOString()};});
 return {checkedAt:now.toISOString(),stale:false,relays};
}
export function staleRelayReport(report:RelayMonitorReport,now=new Date(),maxAgeMs=120_000):RelayMonitorReport{if(now.getTime()-Date.parse(report.checkedAt)<=maxAgeMs)return report;return {...report,stale:true,relays:report.relays.map(relay=>({...relay,status:"unknown" as const}))};}
