import {getEventHash,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {isSuperAdmin} from "./authority";

const content=JSON.stringify({action:"list-relay-monitoring"});
export function relayMonitorRequest(origin:string,now=Math.floor(Date.now()/1000)):EventTemplate{
 return {kind:27235,created_at:now,tags:[["u",`${origin}/api/monitoring/relays`],["method","POST"],["t","bitcoinwalk-relay-monitor-v1"]],content};
}
export function authorizeRelayMonitor(event:Event,origin:string,now=Math.floor(Date.now()/1000)){
 const expected=relayMonitorRequest(origin,now);
 if(!isSuperAdmin(event.pubkey)||getEventHash(event)!==event.id||!verifyEvent(event)||event.kind!==expected.kind||Math.abs(now-event.created_at)>300||event.content!==expected.content||JSON.stringify(event.tags)!==JSON.stringify(expected.tags))throw new Error("Signed super-admin authorization required.");
 return event.pubkey;
}
