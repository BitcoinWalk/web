import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("web-push",()=>({default:{sendNotification:vi.fn(async()=>({statusCode:201}))}}));
import webpush from "web-push";
import {deliverWebPush,safePushEndpoint,webPushConfig} from "./web-push-delivery";
const device={id:"10000000-0000-4000-8000-000000000001",ownerPubkey:"a".repeat(64),label:"Phone",endpoint:"https://fcm.googleapis.com/fcm/send/secret",endpointHash:"b".repeat(64),p256dh:"c".repeat(65),auth:"d".repeat(22),preferences:{walkReminders:true,workflowUpdates:true,quietStart:null,quietEnd:null,timeZone:"UTC"},createdAt:1,updatedAt:1,lastSuccessAt:null,lastFailureAt:null,failureCount:0,lastTestAt:null};
describe("web push delivery",()=>{
 beforeEach(()=>vi.unstubAllEnvs());
 it("fails closed until the complete VAPID configuration is enabled",()=>{vi.stubEnv("BITCOINWALK_WEB_PUSH_ENABLED","1");expect(webPushConfig()).toBeNull();});
 it.each(["http://fcm.googleapis.com/x","https://127.0.0.1/x","https://evil.example/x","https://user:pass@fcm.googleapis.com/x","https://fcm.googleapis.com:444/x"])("rejects unsafe or unsupported endpoint %s",value=>expect(()=>safePushEndpoint(value)).toThrow());
 it("sends bounded visible payloads with per-message VAPID settings",async()=>{const config={publicKey:"public",privateKey:"private",subject:"mailto:notifications@bitcoinwalk.org"};await deliverWebPush(device,{title:"Ready",body:"Delivery works",path:"/admin/notifications",tag:"bitcoinwalk-notification-test"},config);expect(webpush.sendNotification).toHaveBeenCalledWith(expect.objectContaining({endpoint:device.endpoint}),expect.stringContaining("Delivery works"),expect.objectContaining({TTL:300,urgency:"normal",vapidDetails:config}));});
});
