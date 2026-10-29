import {describe,expect,it} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {authorizeWebPushCommand,webPushCommandTemplate} from "./web-push-auth";

const origin="https://app-staging.bitcoinwalk.org",now=1_800_000_000,key=generateSecretKey(),preferences={walkReminders:true,workflowUpdates:false,quietStart:"22:00",quietEnd:"07:00",timeZone:"Atlantic/Madeira"};
describe("web push authorization",()=>{
 it("binds the exact account, origin, device capability and preferences",()=>{const command={action:"save" as const,deviceId:"10000000-0000-4000-8000-000000000001",label:"Pixel",subscription:{endpoint:"https://fcm.googleapis.com/fcm/send/secret",keys:{p256dh:"a".repeat(65),auth:"b".repeat(22)}},preferences},event=finalizeEvent(webPushCommandTemplate(command,origin,now),key);expect(authorizeWebPushCommand(event,origin,now)).toEqual(command);expect(event.pubkey).toBe(getPublicKey(key));expect(()=>authorizeWebPushCommand(event,"https://bitcoinwalk.org",now)).toThrow();expect(()=>authorizeWebPushCommand(event,origin,now+301)).toThrow();const altered=JSON.parse(JSON.stringify(event));altered.content=JSON.stringify({...command,label:"Other"});expect(()=>authorizeWebPushCommand(altered,origin,now)).toThrow();});
 it("requires complete quiet hours and a real time zone",()=>{expect(()=>webPushCommandTemplate({action:"preferences",deviceId:"10000000-0000-4000-8000-000000000001",preferences:{...preferences,quietEnd:null}},origin,now)).toThrow();expect(()=>webPushCommandTemplate({action:"preferences",deviceId:"10000000-0000-4000-8000-000000000001",preferences:{...preferences,timeZone:"Moon/Base"}},origin,now)).toThrow();});
});
