export type CitySearchResult={name:string;cityName:string;latitude:number;longitude:number};
type Result={status:number;results:CitySearchResult[];error?:string};
function latinName(value:unknown,maxLength:number){
 if(typeof value!=="string")return null;
 const name=value.trim().replace(/\s+/g," ").slice(0,maxLength),letters=[...name].filter(character=>/\p{Letter}/u.test(character));
 return letters.length&&letters.every(character=>/\p{Script=Latin}/u.test(character))?name:null;
}
/** One process only: global upstream gate, no queued retries, bounded 24h cache. */
export function createCitySearch(fetcher:typeof fetch=fetch,now:()=>number=Date.now){
 const cache=new Map<string,{expires:number;results:CitySearchResult[]}>();let nextAllowed=0,busy=false;
 return async(query:string,endpoint="https://nominatim.openstreetmap.org/search"):Promise<Result>=>{
  query=query.trim().replace(/\s+/g," ");
  if(query.length<2||query.length>120)return {status:400,results:[],error:"Enter a city name between 2 and 120 characters."};
  const key=endpoint+":"+query.toLowerCase(),hit=cache.get(key);
  if(hit&&hit.expires>now())return {status:200,results:hit.results};
  if(busy||now()<nextAllowed)return {status:429,results:[],error:"City search is busy. Wait a moment and click Search city again."};
  busy=true;nextAllowed=now()+1100;
  try{
   const url=new URL(endpoint);if(url.protocol!=="https:")throw new Error("Invalid provider");
   url.search=new URLSearchParams({format:"jsonv2",addressdetails:"1",namedetails:"1","accept-language":"en",limit:"5",q:query}).toString();
   const response=await fetcher(url,{headers:{"User-Agent":"BitcoinWalk/0.1 (https://bitcoinwalk.org)","Accept-Language":"en"},signal:AbortSignal.timeout(8000),redirect:"error"});
   if(!response.ok)throw new Error("Upstream search failed");
   const data:unknown=await response.json();if(!Array.isArray(data))throw new Error("Invalid response");
   const results:CitySearchResult[]=data.slice(0,5).flatMap(item=>{
    if(!item||typeof item!=="object"||typeof item.display_name!=="string")return [];
    const latitude=Number(item.lat),longitude=Number(item.lon);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return [];
    const a=item.address??{},names=item.namedetails??{};
    const cityName=[names["name:en"],names.int_name,a.city,a.town,a.village,a.municipality,a.county,names["name:simple"],item.display_name.split(",")[0],...Object.values(names)].map(value=>latinName(value,100)).find(Boolean);
    if(!cityName)return [];
    const displayName=latinName(item.display_name,500)??cityName;
    return [{name:displayName,cityName,latitude,longitude}];
   });
   if(cache.size>=512)cache.delete(cache.keys().next().value!);
   cache.set(key,{expires:now()+86400000,results});return {status:200,results};
  }catch{return {status:502,results:[],error:"City search is temporarily unavailable. Please try again later."};}
  finally{busy=false;}
 };
}
