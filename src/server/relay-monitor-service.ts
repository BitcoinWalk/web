import {chatConfig} from "../lib/chat-config";
import {relayConfig} from "../lib/relay-config";
import {loadReplicationStatus} from "./replication-status";
import {buildManagedRelayInventory,monitorRelays,staleRelayReport,type RelayMonitorReport} from "./relay-monitor";

const CACHE_MS=30_000,MAX_STALE_MS=120_000;
let cached:RelayMonitorReport|undefined,inflight:Promise<RelayMonitorReport>|undefined;

async function refresh():Promise<RelayMonitorReport>{
 let replication;try{replication=await loadReplicationStatus();}catch{replication=undefined;}
 const community=[chatConfig.global?.relay,...Object.values(chatConfig.paidCities).map(city=>city.destination?.relay)].filter((relay):relay is string=>Boolean(relay));
 const inventory=buildManagedRelayInventory({application:[...relayConfig.readRelays,...relayConfig.writeRelays],directory:relayConfig.directoryRelays,community,replication});
 return monitorRelays(inventory,{concurrency:3});
}
export async function loadRelayMonitorReport(now=new Date()):Promise<RelayMonitorReport>{
 if(cached&&now.getTime()-Date.parse(cached.checkedAt)<CACHE_MS)return cached;
 if(!inflight)inflight=refresh().then(report=>(cached=report)).finally(()=>{inflight=undefined;});
 try{return await inflight;}catch{if(cached)return staleRelayReport(cached,now,MAX_STALE_MS);throw new Error("Relay monitoring is temporarily unavailable.");}
}
export function resetRelayMonitorCache(){cached=undefined;inflight=undefined;}
