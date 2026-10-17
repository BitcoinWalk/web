import {finalizeEvent,type Event} from "nostr-tools";
import {z} from "zod";
import {mediaRequestTemplate} from "../domain/media-request";

const host=z.object({ownerPubkey:z.string().regex(/^[0-9a-f]{64}$/),cityNames:z.array(z.string().min(1).max(100)).min(1).max(100)}).strict();
const report=z.object({version:z.literal(1),hosts:z.array(host).max(100),checkedAt:z.string().datetime()}).strict();
export type GuideOrganizerChatHost=z.infer<typeof host>;
export async function readGuideOrganizerChatHosts(secret:Uint8Array,url:string,request:typeof fetch=fetch):Promise<GuideOrganizerChatHost[]>{
 const event:Event=finalizeEvent(mediaRequestTemplate({action:"list-organizer-chat-invitations"}),secret);
 const response=await request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error(`Host invitations returned HTTP ${response.status}.`);
 return report.parse(await response.json()).hosts;
}
