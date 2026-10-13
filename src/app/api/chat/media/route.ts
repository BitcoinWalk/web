import {createHash} from "node:crypto";
import type {Event} from "nostr-tools";
import {parseMediaRequest} from "../../../../domain/media-request";
import {validNip29Destination} from "../../../../nostr/nip29-chat";
import {storeChatImage} from "../../../../server/media-store";

export const dynamic="force-dynamic",runtime="nodejs";

export async function POST(request:Request){
 try{
  const declared=Number(request.headers.get("content-length")||0);if(declared>5.5*1024*1024)return Response.json({error:"Chat images must be 5 MB or smaller."},{status:413});
  const form=await request.formData(),raw=form.get("event"),file=form.get("file");if(typeof raw!=="string"||!(file instanceof File))return Response.json({error:"Signed image upload required."},{status:401});
  const event=JSON.parse(raw) as Event,command=parseMediaRequest(event);if(!command||command.action!=="upload-chat-image")return Response.json({error:"Invalid or expired image authorization."},{status:401});
  if(!validNip29Destination({relay:command.relay,groupId:command.groupId}))return Response.json({error:"This is not a BitcoinWalk chat."},{status:403});
  if(file.size!==command.bytes||file.type!==command.mime||file.size>5*1024*1024)return Response.json({error:"The selected file does not match the signed upload."},{status:400});
  const bytes=Buffer.from(await file.arrayBuffer()),hash=createHash("sha256").update(bytes).digest("hex");if(hash!==command.sha256)return Response.json({error:"The selected file changed before upload."},{status:400});
  const origin=(process.env.BITCOINWALK_MEDIA_PUBLIC_ORIGIN||new URL(request.url).origin).replace(/\/$/,"");if(!origin.startsWith("https://"))throw new Error("Media public origin must use HTTPS.");
  const record=await storeChatImage({groupId:command.groupId,actor:event.pubkey,bytes,mime:command.mime,origin});return Response.json({url:record.internalUrl,hash:record.contentHash},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Image upload failed."},{status:400,headers:{"Cache-Control":"no-store"}});}
}
