import type {CitySearchResult} from "./geocode";
export const CITY_SEARCH_DELAY=650;
const normalize=(value:string)=>value.normalize("NFD").replace(/\p{Mark}/gu,"").toLocaleLowerCase().trim();
export function narrowCitySuggestions(rows:CitySearchResult[],query:string,resultsQuery:string){
 const value=normalize(query);
 if(value.length<2)return [];
 return (value===normalize(resultsQuery)?rows:rows.filter(row=>normalize(row.cityName).startsWith(value))).slice(0,5);
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
