import type {CitySearchResult,PlaceSearchResult} from "./geocode";
export const CITY_SEARCH_DELAY=650;
const normalize=(value:string)=>value.normalize("NFD").replace(/\p{Mark}/gu,"").toLocaleLowerCase().trim();
export function narrowCitySuggestions(rows:CitySearchResult[],query:string,resultsQuery:string){
 const value=normalize(query);
 if(value.length<2)return [];
 return (value===normalize(resultsQuery)?rows:rows.filter(row=>normalize(row.cityName).startsWith(value))).slice(0,5);
}
export function narrowMeetingPointSuggestions(rows:PlaceSearchResult[],query:string,resultsQuery:string){
 const value=normalize(query),loaded=normalize(resultsQuery);
 if(value.length<2||!loaded||(value!==loaded&&!value.startsWith(loaded)))return [];
 return rows.filter(row=>normalize(row.name).includes(value)).slice(0,5);
}
export async function fetchCitySuggestions(query:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<CitySearchResult[]>{
 for(let attempt=0;attempt<2;attempt++){
  signal.throwIfAborted();
  const response=await fetcher(`/api/geocode?q=${encodeURIComponent(query)}`,{signal});
  if(response.status===429&&attempt===0){
   await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));},timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},2000);signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();});
   continue;
  }
  const data=await response.json() as {results:CitySearchResult[];error?:string};
  if(!response.ok)throw new Error(data.error??"City search is unavailable. Edit the city name to retry or place the pin manually.");
  return data.results;
 }
 return [];
}

export async function fetchMeetingPointName(latitude:number,longitude:number,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<string>{
 for(let attempt=0;attempt<2;attempt++){
  signal.throwIfAborted();
  const response=await fetcher(`/api/geocode/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,{signal});
  if(response.status===429&&attempt===0){
   await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));},timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},2000);signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();});
   continue;
  }
  const data=await response.json() as {result?:{name?:string};error?:string};
  if(!response.ok||!data.result?.name)throw new Error(data.error??"The meeting-point name could not be refreshed. You can still edit it manually.");
  return data.result.name;
 }
 throw new Error("The meeting-point name could not be refreshed. You can still edit it manually.");
}

export function parseCoordinateSearch(query:string):{latitude:number;longitude:number}|null{
 const match=query.match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:,|\s)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*$/);
 if(!match)return null;
 const latitude=Number(match[1]),longitude=Number(match[2]);
 if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw new Error("Use latitude from −90 to 90 and longitude from −180 to 180.");
 return {latitude,longitude};
}

export async function fetchMeetingPointSuggestions(query:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<PlaceSearchResult[]>{
 const coordinates=parseCoordinateSearch(query);
 if(coordinates){
  const name=await fetchMeetingPointName(coordinates.latitude,coordinates.longitude,signal,fetcher);
  return [{name,...coordinates}];
 }
 for(let attempt=0;attempt<2;attempt++){
  signal.throwIfAborted();
  const response=await fetcher(`/api/geocode/places?q=${encodeURIComponent(query)}`,{signal});
  if(response.status===429&&attempt===0){
   await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));},timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},2000);signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();});
   continue;
  }
  const data=await response.json() as {results?:PlaceSearchResult[];error?:string};
  if(!response.ok)throw new Error(data.error??"Meeting-point search is unavailable. Move the pin or enter coordinates instead.");
  return data.results??[];
 }
 return [];
}
