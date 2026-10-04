import {getLogoCatalog} from "../../../../../logos/runtime";
export const dynamic="force-dynamic",runtime="nodejs";

export async function GET(_request:Request,{params}:{params:Promise<{jobKey:string;file:string}>}){
  try{
    const {jobKey,file}=await params;
    const item=await getLogoCatalog().file(jobKey,file);
    if(!item)return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"}});
    return new Response(new Uint8Array(item.data),{headers:{
      "Content-Type":item.mime,"Content-Length":String(item.data.length),"Content-Disposition":`attachment; filename="${item.name}"`,
      "Cache-Control":"public, max-age=31536000, immutable","ETag":`\"${item.sha256}\"`,"X-Content-Type-Options":"nosniff",
      ...(!item.publiclyListed?{"X-Robots-Tag":"noindex, nofollow"}:{}),
    }});
  }catch{return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"}});}
}
