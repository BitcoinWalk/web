import {getEventHash,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {isSuperAdmin} from "./authority";

export type ArmadaProvisionAction={action:"list"}|{action:"verify";cityId:string;slug:string;groupId:string;picture:string}|{action:"activate";cityId:string;evidenceDigest:string};
const content=(action:ArmadaProvisionAction)=>JSON.stringify(action);
export function armadaProvisionRequest(action:ArmadaProvisionAction,origin:string,now=Math.floor(Date.now()/1000)):EventTemplate{return {kind:27235,created_at:now,tags:[["u",`${origin}/api/monitoring/armada`],["method","POST"],["t","bitcoinwalk-armada-provision-v1"]],content:content(action)};}
export function authorizeArmadaProvision(event:Event,action:ArmadaProvisionAction,origin:string,now=Math.floor(Date.now()/1000)){
 const expected=armadaProvisionRequest(action,origin,now);if(!isSuperAdmin(event.pubkey)||getEventHash(event)!==event.id||!verifyEvent(event)||event.kind!==expected.kind||Math.abs(now-event.created_at)>300||event.content!==expected.content||JSON.stringify(event.tags)!==JSON.stringify(expected.tags))throw new Error("Signed super-admin authorization required.");return event.pubkey;
}
