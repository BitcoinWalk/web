import {createHash} from "node:crypto";
import {type Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {isSuperAdmin} from "../../../../nostr/authority";
import {latestSponsorships,querySponsorships} from "../../../../nostr/sponsorships";
import {serverReadRelays} from "../../../../lib/server-relay-config";
import {storePendingSponsorLogo} from "../../../../server/sponsor-logo-store";
import {MAX_SPONSOR_LOGO_BYTES} from "../../../../server/sponsor-logo";
export const runtime="nodejs",dynamic="force-dynamic";
const limit=Math.ceil(MAX_SPONSOR_LOGO_BYTES/3)*4+16384;
const reply=(error:string,status:number)=>Response.json({error},{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request) {
  try {
    if (!request.body || Number(request.headers.get("content-length"))>limit) return reply("Upload exceeds the limit.",413);
    const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return reply("Upload exceeds the limit.",413);}chunks.push(value);}}finally{reader.releaseLock();}
    const body=JSON.parse(Buffer.concat(chunks).toString("utf8")) as {event?:Event;base64?:string};
    if(!body.event)return reply("Signed upload authorization required.",401);
    const command=parseMediaRequest(body.event);
    if(!command||command.action!=="upload-sponsor-logo")return reply("Invalid or expired upload authorization.",401);
    const actor=body.event.pubkey;
    if(!isSuperAdmin(actor))return reply("Only the super-admin can upload sponsor artwork.",403);
    const assigned=latestSponsorships(await querySponsorships(serverReadRelays())).some(row=>row.sponsorship.mode==="sponsor"&&row.sponsorship.scope.cityId===command.cityId&&row.sponsorship.sponsorPubkey===command.sponsorPubkey);
    if(!assigned)return reply("A signed sponsor assignment is required before upload.",403);
    if(typeof body.base64!=="string"||!body.base64||body.base64.length>limit)return reply("Invalid file encoding.",400);
    const bytes=Buffer.from(body.base64,"base64");
    if(bytes.toString("base64")!==body.base64)return reply("Invalid file encoding.",400);
    if(createHash("sha256").update(bytes).digest("hex")!==command.sha256)return reply("Upload does not match the signed file hash.",400);
    const result=await storePendingSponsorLogo({bytes,mime:command.mime,cityId:command.cityId,sponsorPubkey:command.sponsorPubkey,actor,signedRequestId:body.event.id});
    return Response.json({status:result.status,hash:result.hash,message:"Logo stored privately pending super-admin approval."},{headers:{"Cache-Control":"no-store"}});
  }catch {return reply("Logo upload failed. Use the super-admin identity, an existing sponsor assignment and a valid PNG, WebP or outlined SVG.",400);}
}
