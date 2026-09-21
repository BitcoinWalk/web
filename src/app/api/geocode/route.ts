import {NextResponse} from "next/server";
import {createCitySearch} from "../../../lib/geocode";
const search=createCitySearch((url,options)=>fetch(url,{...options,next:{revalidate:86400}}));
export const runtime="nodejs";
export async function GET(request:Request){
 const result=await search(new URL(request.url).searchParams.get("q")??"",process.env.GEOCODE_SEARCH_URL);
 return NextResponse.json({results:result.results,...(result.error?{error:result.error}:{})},{status:result.status,headers:{"Cache-Control":"no-store",...(result.status===429?{"Retry-After":"2"}:{})}});
}
