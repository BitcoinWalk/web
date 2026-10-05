import {readSponsorLogoAsset} from "../../../../../../server/sponsor-logo-store";
import {latestSponsorships,querySponsorships} from "../../../../../../nostr/sponsorships";
import {serverReadRelays} from "../../../../../../lib/server-relay-config";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{hash:string}>}){
 const {hash}=await params,headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 if(!/^[a-f0-9]{64}$/.test(hash))return new Response("Not found",{status:404,headers});
 try{
  const approved=latestSponsorships(await querySponsorships(serverReadRelays())).some(row=>row.sponsorship.mode==="sponsor"&&row.sponsorship.logoHash===hash);
  if(!approved)return new Response("Not found",{status:404,headers});
  const body=await readSponsorLogoAsset(hash);if(!body)return new Response("Not found",{status:404,headers});
  return new Response(new Uint8Array(body),{headers:{...headers,"Content-Type":"image/png","Content-Length":String(body.length)}});
 }catch{return new Response("Unavailable",{status:503,headers});}
}
