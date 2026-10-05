import {readShareImage} from "../../../../../server/share-image";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{hash:string}>}){
  const name=(await params).hash,hash=/^([a-f0-9]{64})\.jpg$/.exec(name)?.[1];
  const bytes=hash?await readShareImage(hash):null;
  return bytes?new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/jpeg","Cache-Control":"public, max-age=31536000, immutable","X-Content-Type-Options":"nosniff",ETag:`"${hash}"`}}):new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
}
