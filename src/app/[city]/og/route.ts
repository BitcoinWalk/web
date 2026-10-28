import {cityShareImage} from "../../../server/share-preview";

export const runtime="nodejs",dynamic="force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{city:string}>}){
  try{
    const image=await cityShareImage((await params).city);
    if(!image)return new Response("City not found",{status:404,headers:{"Cache-Control":"no-store"}});
    return new Response(null,{status:307,headers:{Location:image.url,"Cache-Control":"no-store"}});
  }catch{
    return new Response("OG image temporarily unavailable",{status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
  }
}
