import {finalizeEvent,type Event} from "nostr-tools";
import {z} from "zod";
import {mediaRequestTemplate} from "../domain/media-request";

const state=z.enum(["healthy","pending","degraded"]);
const reportSchema=z.object({version:z.literal(1),state,reconciled:z.boolean(),cities:z.array(z.object({cityId:z.string().uuid(),destination:z.url().refine(value=>value.startsWith("wss://")),state,counts:z.record(z.string(),z.number().int().nonnegative())}).strict())}).strict();
export type GuideReplicationReport=z.infer<typeof reportSchema>;

export async function readGuideReplicationStatus(secret:Uint8Array,request:typeof fetch=fetch):Promise<GuideReplicationReport>{
 const event:Event=finalizeEvent(mediaRequestTemplate({action:"list-replication-status"}),secret);
 const response=await request("http://127.0.0.1:3338/api/replication/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error(`Replication status returned HTTP ${response.status}.`);
 const body=z.object({report:reportSchema,checkedAt:z.string().datetime()}).strict().parse(await response.json());
 return body.report;
}
