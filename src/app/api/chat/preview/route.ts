import {chatLinkPreview} from "../../../../server/chat-link-preview";
export const dynamic="force-dynamic",runtime="nodejs";
let windowStarted=0,requests=0;
export async function GET(request:Request){const now=Date.now();if(now-windowStarted>60_000){windowStarted=now;requests=0;}if(++requests>120)return Response.json({error:"Preview service is busy."},{status:429,headers:{"Cache-Control":"no-store"}});const value=new URL(request.url).searchParams.get("url")??"";const preview=await chatLinkPreview(value);return preview?Response.json(preview,{headers:{"Cache-Control":"public, max-age=900"}}):Response.json({error:"Preview unavailable."},{status:404,headers:{"Cache-Control":"public, max-age=300"}});}
