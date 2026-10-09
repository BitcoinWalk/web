import {managedNip05} from "../../../server/rustress-public-gateway";
export const dynamic="force-dynamic",runtime="nodejs";
export async function GET(request:Request){const name=new URL(request.url).searchParams.get("name")??"";return managedNip05(name);}
