export type CitySearchResult={name:string;cityName:string;latitude:number;longitude:number};
type Result={status:number;results:CitySearchResult[];error?:string};
export type CitySearchOptions={locationIqToken?:string;photonEndpoint?:string};
export type ReverseGeocodeResult={name:string};
type ReverseResult={status:number;result?:ReverseGeocodeResult;error?:string};

const LOCATIONIQ_ENDPOINT="https://api.locationiq.com/v1/autocomplete";
const LOCATIONIQ_REVERSE_ENDPOINT="https://api.locationiq.com/v1/reverse";
const DEFAULT_PHOTON_ENDPOINT="https://photon.komoot.io/api/";
const DEFAULT_PHOTON_REVERSE_ENDPOINT="https://photon.komoot.io/reverse";
const PLACE_TYPES=new Set(["city","town","village","hamlet"]);

function latinName(value:unknown,maxLength:number){
 if(typeof value!=="string")return null;
 const name=value.trim().replace(/\s+/g," ").slice(0,maxLength),letters=[...name].filter(character=>/\p{Letter}/u.test(character));
 return letters.length&&letters.every(character=>/\p{Script=Latin}/u.test(character))?name:null;
}
function coordinates(latitude:unknown,longitude:unknown){
 const lat=typeof latitude==="string"?Number(latitude):latitude,lon=typeof longitude==="string"?Number(longitude):longitude;
 return typeof lat==="number"&&typeof lon==="number"&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{latitude:lat,longitude:lon}:null;
}
function label(cityName:string,parts:unknown[]){return [...new Set([cityName,...parts].map(value=>latinName(value,150)).filter(Boolean))].join(", ");}

function addressLabel(parts:unknown[]){
 return [...new Set(parts.map(value=>latinName(value,150)).filter(Boolean))].join(", ").slice(0,500);
}

function locationIqReverseResult(data:unknown):ReverseGeocodeResult|null{
 if(!data||typeof data!=="object")throw new Error("Invalid LocationIQ response");
 const record=data as Record<string,unknown>,address=record.address&&typeof record.address==="object"?record.address as Record<string,unknown>:{};
 const street=address.road??address.pedestrian??address.footway??address.path;
 const streetAddress=address.house_number&&street?`${String(street).trim()} ${String(address.house_number).trim()}`:street;
 const name=addressLabel([record.name,streetAddress,address.suburb??address.neighbourhood,address.city??address.town??address.village??address.hamlet,address.state,address.country]);
 return name?{name}:null;
}

function photonReverseResult(data:unknown):ReverseGeocodeResult|null{
 if(!data||typeof data!=="object"||!("features" in data)||!Array.isArray(data.features))throw new Error("Invalid Photon response");
 const feature=data.features[0];if(!feature||typeof feature!=="object")return null;
 const properties=(feature as {properties?:Record<string,unknown>}).properties;if(!properties)return null;
 const street=properties.street,streetAddress=properties.housenumber&&street?`${String(street).trim()} ${String(properties.housenumber).trim()}`:street;
 const name=addressLabel([properties.name,streetAddress,properties.district??properties.locality,properties.city??properties.town??properties.village,properties.state,properties.country]);
 return name?{name}:null;
}

function locationIqResults(data:unknown):CitySearchResult[]{
 if(!Array.isArray(data))throw new Error("Invalid LocationIQ response");
 return data.slice(0,5).flatMap(item=>{
  if(!item||typeof item!=="object")return [];
  const record=item as Record<string,unknown>,address=record.address&&typeof record.address==="object"?record.address as Record<string,unknown>:{};
  if(record.class!=="place"||typeof record.type!=="string"||!PLACE_TYPES.has(record.type))return [];
  const point=coordinates(record.lat,record.lon),cityName=latinName(address.city??record.display_place,100);
  if(!point||!cityName)return [];
  return [{name:label(cityName,[address.county,address.state,address.country]),cityName,...point}];
 });
}
function photonResults(data:unknown):CitySearchResult[]{
 if(!data||typeof data!=="object"||!("features" in data)||!Array.isArray(data.features))throw new Error("Invalid Photon response");
 return data.features.slice(0,5).flatMap(item=>{
  if(!item||typeof item!=="object")return [];
  const record=item as {geometry?:{type?:unknown;coordinates?:unknown};properties?:Record<string,unknown>};
  if(record.geometry?.type!=="Point"||!Array.isArray(record.geometry.coordinates))return [];
  const [longitude,latitude]=record.geometry.coordinates,point=coordinates(latitude,longitude),properties=record.properties;
  if(!point||!properties||properties.osm_key!=="place"||typeof properties.osm_value!=="string"||!PLACE_TYPES.has(properties.osm_value))return [];
  const cityName=latinName(properties.name,100);if(!cityName)return [];
  return [{name:label(cityName,[properties.county,properties.state,properties.country]),cityName,...point}];
 });
}

/** One process: global upstream gate and bounded cache kept below LocationIQ's free-tier limits. */
export function createCitySearch(fetcher:typeof fetch=fetch,now:()=>number=Date.now){
 const cache=new Map<string,{expires:number;results:CitySearchResult[]}>();let nextAllowed=0,busy=false;
 return async(query:string,options:CitySearchOptions|string={}):Promise<Result>=>{
  query=query.trim().replace(/\s+/g," ");
  if(query.length<2||query.length>120)return {status:400,results:[],error:"Enter a city name between 2 and 120 characters."};
  const config=typeof options==="string"?{photonEndpoint:options}:options,token=config.locationIqToken?.trim(),provider=token?"locationiq":"photon";
  const key=provider+":"+query.toLowerCase(),hit=cache.get(key);
  if(hit&&hit.expires>now())return {status:200,results:hit.results};
  if(busy||now()<nextAllowed)return {status:429,results:[],error:"City search is busy. Please try again shortly."};
  busy=true;nextAllowed=now()+1100;
  try{
   let results:CitySearchResult[]|undefined;
   if(token){
    try{
     const url=new URL(LOCATIONIQ_ENDPOINT);url.search=new URLSearchParams({key:token,q:query,limit:"5",layers:"city",tag:"place:city,place:town,place:village,place:hamlet",normalizecity:"1",dedupe:"1","accept-language":"en"}).toString();
     const response=await fetcher(url,{headers:{"User-Agent":"BitcoinWalk/0.1 (https://bitcoinwalk.org)"},signal:AbortSignal.timeout(8000),redirect:"error",cache:"no-store"});
     if(!response.ok)throw new Error("LocationIQ search failed");
     results=locationIqResults(await response.json());
    }catch{/* The public Photon service remains a best-effort fallback. */}
   }
   if(!results){
    const url=new URL(config.photonEndpoint??DEFAULT_PHOTON_ENDPOINT);
    if(url.protocol!=="https:"||url.username||url.password||url.hash||url.hostname==="nominatim.openstreetmap.org")throw new Error("Invalid Photon provider");
    url.search=new URLSearchParams({lang:"en",limit:"5",q:query}).toString();
    for(const type of PLACE_TYPES)url.searchParams.append("osm_tag",`place:${type}`);
    const response=await fetcher(url,{headers:{"User-Agent":"BitcoinWalk/0.1 (https://bitcoinwalk.org)","Accept-Language":"en"},signal:AbortSignal.timeout(8000),redirect:"error",cache:"no-store"});
    if(!response.ok)throw new Error("Photon search failed");
    results=photonResults(await response.json());
   }
   if(cache.size>=512)cache.delete(cache.keys().next().value!);
   cache.set(key,{expires:now()+86400000,results});return {status:200,results};
  }catch{return {status:502,results:[],error:"City search is temporarily unavailable. Please try again later."};}
  finally{busy=false;}
 };
}

/** Reverse geocoding is server-side so provider credentials never reach the browser. */
export function createReverseGeocode(fetcher:typeof fetch=fetch,now:()=>number=Date.now){
 const cache=new Map<string,{expires:number;result:ReverseGeocodeResult}>();let nextAllowed=0,busy=false;
 return async(latitude:unknown,longitude:unknown,options:CitySearchOptions={}):Promise<ReverseResult>=>{
  const point=coordinates(latitude,longitude);if(!point)return {status:400,error:"Use valid meeting-point coordinates."};
  const token=options.locationIqToken?.trim(),provider=token?"locationiq":"photon",key=`${provider}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`,hit=cache.get(key);
  if(hit&&hit.expires>now())return {status:200,result:hit.result};
  if(busy||now()<nextAllowed)return {status:429,error:"Meeting-point lookup is busy. Please try again shortly."};
  busy=true;nextAllowed=now()+1100;
  try{
   let result:ReverseGeocodeResult|null|undefined;
   if(token){
    try{
     const url=new URL(LOCATIONIQ_REVERSE_ENDPOINT);url.search=new URLSearchParams({key:token,lat:String(point.latitude),lon:String(point.longitude),format:"json","accept-language":"en",normalizeaddress:"1"}).toString();
     const response=await fetcher(url,{headers:{"User-Agent":"BitcoinWalk/0.1 (https://bitcoinwalk.org)"},signal:AbortSignal.timeout(8000),redirect:"error",cache:"no-store"});
     if(!response.ok)throw new Error("LocationIQ reverse lookup failed");result=locationIqReverseResult(await response.json());
    }catch{/* Photon remains a best-effort fallback. */}
   }
   if(result==null){
    const url=new URL(options.photonEndpoint??DEFAULT_PHOTON_REVERSE_ENDPOINT);
    if(url.protocol!=="https:"||url.username||url.password||url.hash||url.hostname==="nominatim.openstreetmap.org")throw new Error("Invalid Photon provider");
    url.search=new URLSearchParams({lang:"en",lat:String(point.latitude),lon:String(point.longitude)}).toString();
    const response=await fetcher(url,{headers:{"User-Agent":"BitcoinWalk/0.1 (https://bitcoinwalk.org)","Accept-Language":"en"},signal:AbortSignal.timeout(8000),redirect:"error",cache:"no-store"});
    if(!response.ok)throw new Error("Photon reverse lookup failed");result=photonReverseResult(await response.json());
   }
   if(!result)return {status:404,error:"No address was found for this meeting point."};
   if(cache.size>=512)cache.delete(cache.keys().next().value!);cache.set(key,{expires:now()+86400000,result});return {status:200,result};
  }catch{return {status:502,error:"The meeting-point name could not be refreshed. You can still edit it manually."};}
  finally{busy=false;}
 };
}
