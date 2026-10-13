import type {Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {brandStudioAccess} from "../../../../domain/brand-studio-access";
import {queryAuthorizations,queryDirectoryRecords} from "../../../../nostr/city-records";
import {serverReadRelays} from "../../../../lib/server-relay-config";

export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"};

export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event},command=body.event?parseMediaRequest(body.event):null;
  if(!body.event||command?.action!=="brand-studio-access")return Response.json({error:"Signed access check required."},{status:401,headers});
  const relays=serverReadRelays(),[directory,authorizations]=await Promise.all([queryDirectoryRecords(relays),queryAuthorizations(relays)]);
  return Response.json(brandStudioAccess(body.event.pubkey,directory.revisions,directory.approvals,authorizations),{headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Access could not be checked."},{status:503,headers});}
}
