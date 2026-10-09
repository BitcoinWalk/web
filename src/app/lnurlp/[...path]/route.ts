import {managedLnurl} from "../../../server/rustress-public-gateway";
export const dynamic="force-dynamic",runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){const {path}=await params,localPart=path[0]??"";return managedLnurl(localPart,`/lnurlp/${path.map(encodeURIComponent).join("/")}`,new URL(request.url).search);}
