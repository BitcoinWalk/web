import {describe,it,expect,vi} from "vitest";
import {createCitySearch,createReverseGeocode} from "./geocode";
const feature={geometry:{type:"Point",coordinates:[-16.9,32.65]},properties:{name:"Funchal",state:"Madeira",country:"Portugal",countrycode:"PT",osm_key:"place",osm_value:"city"}};
const data={features:[feature]};
const locationIqData=[{lat:"52.2297",lon:"21.0122",class:"place",type:"city",display_place:"Warsaw",address:{city:"Warsaw",state:"Masovian Voivodeship",country:"Poland",country_code:"pl"}}];
describe("Photon city autocomplete",()=>{
 it("validates input without requests",async()=>{const f=vi.fn();expect((await createCitySearch(f)("a")).status).toBe(400);expect(f).not.toHaveBeenCalled();});
 it("normalizes, caches and globally rate limits requests",async()=>{let time=10000;const f=vi.fn(async()=>Response.json(data)),search=createCitySearch(f,()=>time);expect((await search("Funchal")).results[0]).toEqual({cityName:"Funchal",name:"Funchal, Madeira, Portugal",countryCode:"PT",latitude:32.65,longitude:-16.9});await search(" funchal ");expect(f).toHaveBeenCalledTimes(1);expect((await search("Chicago")).status).toBe(429);time+=1100;expect((await search("Chicago")).status).toBe(200);});
 it("rejects concurrent requests and recovers after errors",async()=>{let finish!:(r:Response)=>void;let time=10000;const f=vi.fn(()=>new Promise<Response>(r=>{finish=r;})),search=createCitySearch(f,()=>time),first=search("Funchal");time+=2000;expect((await search("Chicago")).status).toBe(429);finish(new Response("",{status:503}));expect((await first).status).toBe(502);const second=search("Funchal");finish(Response.json(data));expect((await second).status).toBe(200);expect(f).toHaveBeenCalledTimes(2);});
 it("uses English names and only settlement filters",async()=>{let requested="";const f:typeof fetch=async input=>{requested=String(input);return Response.json(data);};await createCitySearch(f)("Funchal","https://search.example/api/");const url=new URL(requested);expect(url.hostname).toBe("search.example");expect(url.searchParams.get("lang")).toBe("en");expect(url.searchParams.getAll("osm_tag")).toEqual(["place:city","place:town","place:village","place:hamlet"]);});
 it.each(["https://nominatim.openstreetmap.org/search","http://photon.komoot.io/api/","https://user:password@search.example/api/"])("rejects unsafe or legacy endpoint %s",async endpoint=>{const f=vi.fn();expect((await createCitySearch(f)("Funchal",endpoint)).status).toBe(502);expect(f).not.toHaveBeenCalled();});
 it("rejects malformed, non-place, non-Latin and invalid-coordinate results",async()=>{const features=[null,{...feature,geometry:{type:"Point",coordinates:[0,91]}},{...feature,properties:{...feature.properties,osm_key:"amenity"}},{...feature,properties:{...feature.properties,name:"Երևան"}}];expect((await createCitySearch(async()=>Response.json({features}))("city")).results).toEqual([]);});
 it("preserves Latin diacritics",async()=>{expect((await createCitySearch(async()=>Response.json({features:[{...feature,properties:{...feature.properties,name:"Łódź",state:"Łódź",country:"Poland"}}]}))("Łódź")).results[0].name).toBe("Łódź, Poland");});
 it("rejects legacy responses",async()=>{expect((await createCitySearch(async()=>Response.json([]))("city")).status).toBe(502);});
});
describe("LocationIQ city autocomplete",()=>{
 it("uses LocationIQ first without exposing its token in the result",async()=>{
  let requested="";const fetcher:typeof fetch=async input=>{requested=String(input);return Response.json(locationIqData);};
  const result=await createCitySearch(fetcher)("Warsaw",{locationIqToken:"secret-token"}),url=new URL(requested);
  expect(result.results).toEqual([{cityName:"Warsaw",name:"Warsaw, Masovian Voivodeship, Poland",countryCode:"PL",latitude:52.2297,longitude:21.0122}]);
  expect(url.origin+url.pathname).toBe("https://api.locationiq.com/v1/autocomplete");
  expect(url.searchParams.get("key")).toBe("secret-token");expect(url.searchParams.get("layers")).toBe("city");expect(JSON.stringify(result)).not.toContain("secret-token");
 });
 it("falls back to Photon when LocationIQ is unavailable",async()=>{
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes("locationiq.com")?new Response("",{status:429}):Response.json(data));
  const result=await createCitySearch(fetcher as typeof fetch)("Funchal",{locationIqToken:"token"});
  expect(result.results[0].cityName).toBe("Funchal");expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it("rejects malformed and non-place LocationIQ results",async()=>{
  const malformed=[{...locationIqData[0],lat:"NaN"},{...locationIqData[0],class:"amenity"},{...locationIqData[0],address:{city:"Երևան"}}];
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes("locationiq.com")?Response.json(malformed):Response.json({features:[]}));
  expect((await createCitySearch(fetcher as typeof fetch)("city",{locationIqToken:"token"})).results).toEqual([]);
 });
});
describe("meeting-point reverse geocoding",()=>{
 it("builds a precise Photon meeting-point label",async()=>{
  const reverse=createReverseGeocode(async()=>Response.json({features:[{properties:{name:"Satoshi Nakamoto Statue",street:"Viale Carlo Cattaneo",housenumber:"4",city:"Lugano",state:"Ticino",country:"Switzerland"}}]}));
  const result=await reverse(46.0043,8.9511);
  expect(result).toEqual({status:200,result:{name:"Satoshi Nakamoto Statue, Viale Carlo Cattaneo 4, Lugano, Ticino, Switzerland"}});
 });
 it("uses LocationIQ without exposing its token",async()=>{
  let requested="";const fetcher:typeof fetch=async input=>{requested=String(input);return Response.json({name:"Parco Ciani",address:{road:"Viale Carlo Cattaneo",house_number:"4",city:"Lugano",state:"Ticino",country:"Switzerland"}});};
  const result=await createReverseGeocode(fetcher)(46.0043,8.9511,{locationIqToken:"secret-token"}),url=new URL(requested);
  expect(result.result?.name).toBe("Parco Ciani, Viale Carlo Cattaneo 4, Lugano, Ticino, Switzerland");
  expect(url.origin+url.pathname).toBe("https://api.locationiq.com/v1/reverse");expect(url.searchParams.get("key")).toBe("secret-token");expect(JSON.stringify(result)).not.toContain("secret-token");
 });
 it("validates coordinates without a provider request",async()=>{const fetcher=vi.fn();expect((await createReverseGeocode(fetcher)(91,0)).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();});
 it("caches nearby repeat lookups and rate limits different points",async()=>{const time=10000,fetcher=vi.fn(async()=>Response.json({features:[{properties:{city:"Lugano",country:"Switzerland"}}]})),reverse=createReverseGeocode(fetcher,()=>time);expect((await reverse(46.0043,8.9511)).status).toBe(200);expect((await reverse(46.0043,8.9511)).status).toBe(200);expect(fetcher).toHaveBeenCalledTimes(1);expect((await reverse(45,8)).status).toBe(429);});
});
