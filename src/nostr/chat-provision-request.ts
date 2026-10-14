import {getEventHash,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {isSuperAdmin} from "./authority";

export type ChatProvisionAction={action:"list"}|{action:"verify";cityId:string;slug:string;groupId:string;picture:string;rosterEvent:Event}|{action:"activate";cityId:string;evidenceDigest:string}|{action:"reconcile";cityId:string;evidenceDigest:string;picture:string;rosterEvent:Event};
const content=(action:ChatProvisionAction)=>JSON.stringify(action);
export function chatProvisionRequest(action:ChatProvisionAction,origin:string,now=Math.floor(Date.now()/1000)):EventTemplate{return {kind:27235,created_at:now,tags:[["u",`${origin}/api/monitoring/chats`],["method","POST"],["t","bitcoinwalk-chat-provision-v1"]],content:content(action)};}
export function authorizeChatProvision(event:Event,action:ChatProvisionAction,origin:string,now=Math.floor(Date.now()/1000)){
 const expected=chatProvisionRequest(action,origin,now);if(!isSuperAdmin(event.pubkey)||getEventHash(event)!==event.id||!verifyEvent(event)||event.kind!==expected.kind||Math.abs(now-event.created_at)>300||event.content!==expected.content||JSON.stringify(event.tags)!==JSON.stringify(expected.tags))throw new Error("Signed super-admin authorization required.");return event.pubkey;
}
