import {readMedia} from "../../../../../server/media-store";
export const dynamic="force-dynamic",runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{hash:string}>}){const value=(await params).hash.replace(/\.webp$/i,"");const body=await readMedia(value);return body?new Response(new Uint8Array(body),{headers:{"Content-Type":"image/webp","Cache-Control":"public, max-age=31536000, immutable","ETag":`\"${value}\"`}}):new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});}
