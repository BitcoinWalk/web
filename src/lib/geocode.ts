export type CitySearchResult={name:string;cityName:string;latitude:number;longitude:number};
type Result={status:number;results:CitySearchResult[];error?:string};
function latinName(value:unknown,maxLength:number){
 if(typeof value!=="string")return null;
 const name=value.trim().replace(/\s+/g," ").slice(0,maxLength),letters=[...name].filter(character=>/\p{Letter}/u.test(character));
 return letters.length&&letters.every(character=>/\p{Script=Latin}/u.test(character))?name:null;
}
/** Photon only. One process: global upstream gate and bounded 24h cache. */
export function createCitySearch(fetcher:typeof fetch=fetch,now:()=>number=Date.now){
 const cache=new Map<string,{expires:number;results:CitySearchResult[]}>();let nextAllowed=0,busy=false;
 return async(query:string,endpoint="https://photon.komoot.io/api/"):Promise<Result>=>{
  query=query.trim().replace(/\s+/g," ");
  if(query.length<2||query.length>120)return {status:400,results:[],error:"Enter a city name between 2 and 120 characters."};
  const key=endpoint+":"+query.toLowerCase(),hit=cache.get(key);
  if(hit&&hit.expires>now())return {status:200,results:hit.results};
  if(busy||now()<nextAllowed)return {status:429,results:[],error:"City search is busy. Please try again shortly."};
  busy=true;nextAllowed=now()+1100;
  try{
   const url=new URL(endpoint);if(url.protocol!=="https:"||url.username||url.password||url.hash||url.hostname==="nominatim.openstreetmap.org")throw new Error("Invalid Photon provider");
   url.search=new URLSearchParams({lang:"en",limit:"5",q:query}).toString();
   for(const type of ["city","town","village","hamlet"])url.searchParams.append("osm_tag",`place:${type}`);
   const response=await fetcher(url,{headers:{"User-Agent":"BitcoinWalk/0.1 (https://bitcoinwalk.org)","Accept-Language":"en"},signal:AbortSignal.timeout(8000),redirect:"error"});
   if(!response.ok)throw new Error("Upstream search failed");
   const data:unknown=await response.json();if(!data||typeof data!=="object"||!("features" in data)||!Array.isArray(data.features))throw new Error("Invalid response");
   const results:CitySearchResult[]=data.features.slice(0,5).flatMap(item=>{
    if(!item||typeof item!=="object"||item.geometry?.type!=="Point"||!Array.isArray(item.geometry.coordinates))return [];
    const [longitude,latitude]=item.geometry.coordinates;if(typeof latitude!=="number"||typeof longitude!=="number"||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return [];
    const p=item.properties;if(!p||p.osm_key!=="place"||!["city","town","village","hamlet"].includes(p.osm_value))return [];
    const cityName=latinName(p.name,100);
    if(!cityName)return [];
    const displayName=[...new Set([cityName,p.county,p.state,p.country].map(value=>latinName(value,150)).filter(Boolean))].join(", ");
    return [{name:displayName,cityName,latitude,longitude}];
   });
   if(cache.size>=512)cache.delete(cache.keys().next().value!);
   cache.set(key,{expires:now()+86400000,results});return {status:200,results};
  }catch{return {status:502,results:[],error:"City search is temporarily unavailable. Please try again later."};}
  finally{busy=false;}
 };
}
