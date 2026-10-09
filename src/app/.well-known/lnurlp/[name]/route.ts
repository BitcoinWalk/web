import {managedLnurl} from "../../../../server/rustress-public-gateway";
export const dynamic="force-dynamic",runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{name:string}>}){const {name}=await params;return managedLnurl(name,`/.well-known/lnurlp/${encodeURIComponent(name)}`,new URL(request.url).search);}
