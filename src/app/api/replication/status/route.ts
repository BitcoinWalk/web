import {type Event} from "nostr-tools";
import {loadReplicationStatus} from "../../../../server/replication-status";
import {isReplicationStatusRequester} from "../../../../server/replication-status-auth";
export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){try{const body=await request.json() as {event?:Event};if(!body.event||!isReplicationStatusRequester(body.event))return Response.json({error:"Replication status authorization required."},{status:403});return Response.json({report:await loadReplicationStatus(),checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});}catch(error){return Response.json({error:error instanceof Error?error.message:"Replication status failed."},{status:503});}}
