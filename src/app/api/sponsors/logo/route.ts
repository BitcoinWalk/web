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
const safeUploadErrors=[
  "Invalid asset identity.","Logo processing is busy. Try again shortly.","Wait one minute before replacing this logo.",
  "SVG logos must be 512 KB or smaller.","SVG declarations and processing instructions are not supported.","Invalid SVG XML.",
  "Use a standard SVG document.","SVG logo is too complex.","SVG supports outlined shapes only; remove text, styles, images and effects.",
  "Invalid SVG namespace.","SVG resources are not supported.","Convert SVG text to paths.","Unsupported SVG node.",
  "Use explicit RGB or hex SVG colours.","Logo must be between 1 byte and 5 MB.","Upload PNG, WebP or SVG. JPEG is not accepted.",
  "File contents must match the selected format; animation is not accepted.","Logo dimensions must be between 32 and 8192 pixels."
];
function safeUploadError(error:unknown){const message=error instanceof Error?error.message:"";return safeUploadErrors.includes(message)||message.startsWith("Unsupported SVG attribute: ")?message:null;}
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
    let assignments;
    try{assignments=latestSponsorships(await querySponsorships(serverReadRelays()));}catch{return reply("Could not confirm the signed sponsor assignment. Retry shortly; no logo was stored.",503);}
    const assigned=assignments.some(row=>row.sponsorship.mode==="sponsor"&&row.sponsorship.scope.cityId===command.cityId&&row.sponsorship.sponsorPubkey===command.sponsorPubkey);
    if(!assigned)return reply("A signed sponsor assignment is required before upload.",403);
    if(typeof body.base64!=="string"||!body.base64||body.base64.length>limit)return reply("Invalid file encoding.",400);
    const bytes=Buffer.from(body.base64,"base64");
    if(bytes.toString("base64")!==body.base64)return reply("Invalid file encoding.",400);
    if(createHash("sha256").update(bytes).digest("hex")!==command.sha256)return reply("Upload does not match the signed file hash.",400);
    let result;
    try{result=await storePendingSponsorLogo({bytes,mime:command.mime,cityId:command.cityId,sponsorPubkey:command.sponsorPubkey,actor,signedRequestId:body.event.id});}catch(error){const safe=safeUploadError(error);return reply(safe??"The logo could not be processed. Use a valid PNG, WebP or outlined SVG.",safe?.includes("busy")||safe?.includes("one minute")?429:400);}
    return Response.json({status:result.status,hash:result.hash,message:"Logo stored privately pending super-admin approval."},{headers:{"Cache-Control":"no-store"}});
  }catch {return reply("Logo upload failed. Use the super-admin identity, an existing sponsor assignment and a valid PNG, WebP or outlined SVG.",400);}
}
