import {finalizeEvent,type Event} from "nostr-tools";
import {z} from "zod";
import {mediaRequestTemplate} from "../domain/media-request";

const task=z.object({cityId:z.string().uuid(),cityName:z.string().min(1).max(200),ownerPubkey:z.string().regex(/^[0-9a-f]{64}$/),state:z.enum(["setup-required","payout-confirmed","signer-confirmed","ready-for-proof"]),updatedAt:z.number().int().nonnegative()}).strict();
const report=z.object({version:z.literal(1),tasks:z.array(task).max(100),checkedAt:z.string().datetime()}).strict();
export type GuideProSetupTask=z.infer<typeof task>;
export async function readGuideProSetupTasks(secret:Uint8Array,url:string,request:typeof fetch=fetch):Promise<GuideProSetupTask[]>{
 const event:Event=finalizeEvent(mediaRequestTemplate({action:"list-pro-setup-notifications"}),secret);
 const response=await request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error(`Pro setup notifications returned HTTP ${response.status}.`);
 return report.parse(await response.json()).tasks;
}
