import {describe,it,expect,vi} from "vitest";
import {createCitySearch} from "./geocode";
const data=[{display_name:"Funchal, Madeira",lat:"32.65",lon:"-16.9",address:{city:"Funchal"}}];
describe("explicit city search service",()=>{
 it("validates input without making upstream requests",async()=>{const f=vi.fn();const search=createCitySearch(f);expect((await search("a")).status).toBe(400);expect(f).not.toHaveBeenCalled();});
 it("caches normalized queries and limits different queries globally",async()=>{let time=10000;const f=vi.fn(async()=>Response.json(data));const search=createCitySearch(f,()=>time);expect((await search("Funchal")).results[0].cityName).toBe("Funchal");expect((await search(" funchal ")).status).toBe(200);expect(f).toHaveBeenCalledTimes(1);expect((await search("Chicago")).status).toBe(429);time+=1100;expect((await search("Chicago")).status).toBe(200);});
 it("rejects concurrent upstream requests and releases lock after failure",async()=>{let finish!:(r:Response)=>void;let time=10000;const f=vi.fn(()=>new Promise<Response>(r=>{finish=r;}));const search=createCitySearch(f,()=>time);const first=search("Funchal");time+=2000;expect((await search("Chicago")).status).toBe(429);finish(new Response("",{status:503}));expect((await first).status).toBe(502);});
 it("does not cache upstream errors",async()=>{let time=10000;const f=vi.fn(async()=>new Response("",{status:503}));const search=createCitySearch(f,()=>time);expect((await search("Funchal")).status).toBe(502);time+=2000;await search("Funchal");expect(f).toHaveBeenCalledTimes(2);});
});
