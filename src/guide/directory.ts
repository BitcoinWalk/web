import {finalizeEvent,type Event} from "nostr-tools";
import {z} from "zod";
import {mediaRequestTemplate} from "../domain/media-request";

const row=z.object({id:z.string().uuid(),cityId:z.string().uuid(),cityName:z.string(),ownerPubkey:z.string().regex(/^[0-9a-f]{64}$/),status:z.enum(["awaiting-owner","signed","rejected","superseded","expired"]),createdAt:z.number().int(),updatedAt:z.number().int(),activationState:z.enum(["not-requested","activating","active","failed"]),activationUpdatedAt:z.number().int().nullable(),activationFailure:z.enum(["transport-failed","confirmation-failed"]).nullable()}).strict();
const report=z.object({version:z.literal(1),requests:z.array(row),checkedAt:z.string().datetime()}).strict();
export type GuideDirectoryRequest=z.infer<typeof row>;
export async function readGuideDirectoryRequests(secret:Uint8Array,url:string,request:typeof fetch=fetch):Promise<GuideDirectoryRequest[]>{
 const event:Event=finalizeEvent(mediaRequestTemplate({action:"list-directory-notifications"}),secret);
 const response=await request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error(`Directory notifications returned HTTP ${response.status}.`);
 return report.parse(await response.json()).requests;
}
