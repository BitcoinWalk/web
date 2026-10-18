import {chatConfig,hostsChatConfig} from "../../../../lib/chat-config";

export const dynamic="force-dynamic",runtime="nodejs";

export function GET(){
 const guidePubkey=process.env.BITCOINWALK_GUIDE_PUBKEY?.trim();
 if(!guidePubkey||!/^[0-9a-f]{64}$/.test(guidePubkey))return Response.json({error:"BitcoinWalk Guide is not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 if(!chatConfig.global)return Response.json({error:"BitcoinWalk shared chats are not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 return Response.json({version:1,guidePubkey,communities:{global:chatConfig.global,hosts:hostsChatConfig}},{headers:{"Cache-Control":"no-store"}});
}
