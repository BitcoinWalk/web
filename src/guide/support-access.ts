import {finalizeEvent} from "nostr-tools";
import {z} from "zod";
import {mediaRequestTemplate} from "../domain/media-request";

export async function readGuideSupportPlan(secret:Uint8Array,setupURL:string|undefined,recipientPubkey:string,request:typeof fetch=fetch){
 if(!setupURL||!["http://127.0.0.1:3345/api/pro-setup-notifications","http://127.0.0.1:3338/api/pro-setup-notifications"].includes(setupURL))throw new Error("Guide plan verification endpoint is required.");
 const event=finalizeEvent(mediaRequestTemplate({action:"guide-support-access",recipientPubkey}),secret);
 const response=await request(setupURL.replace("/pro-setup-notifications","/guide-support-access"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error("Guide plan verification is unavailable. Retry later.");
 return z.object({version:z.literal(1),plan:z.enum(["basic","pro"])}).strict().parse(await response.json()).plan;
}
