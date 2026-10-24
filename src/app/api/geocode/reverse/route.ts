import {NextResponse} from "next/server";
import {createReverseGeocode} from "../../../../lib/geocode";

const reverseGeocode=createReverseGeocode();
export const runtime="nodejs";

export async function GET(request:Request){
 const query=new URL(request.url).searchParams;
 const result=await reverseGeocode(query.get("lat"),query.get("lon"),{
  locationIqToken:process.env.LOCATIONIQ_ACCESS_TOKEN,
  photonEndpoint:process.env.PHOTON_REVERSE_URL,
 });
 return NextResponse.json({...(result.result?{result:result.result}:{}),...(result.error?{error:result.error}:{})},{status:result.status,headers:{"Cache-Control":"no-store",...(result.status===429?{"Retry-After":"2"}:{})}});
}
