import {type Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../../domain/media-request";
import {isSuperAdmin} from "../../../../../nostr/authority";
import {reviewPendingSponsorLogo} from "../../../../../server/sponsor-logo-store";
export const runtime="nodejs",dynamic="force-dynamic";
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 try{
  if(!request.body)return Response.json({error:"Authorization required."},{status:401,headers});
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>16384){await reader.cancel();return Response.json({error:"Request too large."},{status:413,headers});}chunks.push(value);}}finally{reader.releaseLock();}
  const body=JSON.parse(Buffer.concat(chunks).toString("utf8")) as {event?:Event};
  const command=body.event&&parseMediaRequest(body.event);
  if(!body.event||!command||command.action!=="review-sponsor-logo"||!isSuperAdmin(body.event.pubkey))return Response.json({error:"Signed super-admin authorization required."},{status:403,headers});
  return Response.json(await reviewPendingSponsorLogo(command.cityId,command.sponsorPubkey),{headers});
 }catch{return Response.json({error:"No intact pending logo is available. Ask the sponsor to upload, or reload after a replacement."},{status:400,headers});}
}
