import {describe,expect,it} from "vitest";
import {resolveCityRoute} from "./city-route";

const row=(cityId:string,slug:string,aliases:string[]=[])=>({revision:{city:{cityId,slug,aliases}}});

describe("public city route aliases",()=>{
 it("redirects every URL-safe alternative name to the canonical slug",()=>{
  const warszawa=row("warszawa-id","warszawa",["Warsaw","Warschau","Varsovia","Warsaw City"]);
  for(const alias of ["warsaw","warschau","varsovia","warsaw-city"]){
   expect(resolveCityRoute([warszawa],alias)).toEqual({row:warszawa,canonicalSlug:"warszawa",redirect:true});
  }
 });
 it("keeps canonical URLs canonical and normalizes casing",()=>{
  const warszawa=row("warszawa-id","warszawa",["Warsaw"]);
  expect(resolveCityRoute([warszawa],"warszawa")?.redirect).toBe(false);
  expect(resolveCityRoute([warszawa],"Warszawa")).toMatchObject({canonicalSlug:"warszawa",redirect:true});
 });
 it("gives canonical slugs priority and rejects ambiguous aliases",()=>{
  const canonical=row("canonical","warsaw"),a=row("a","warszawa",["Warsaw"]),b=row("b","other",["Warsaw"]);
  expect(resolveCityRoute([a,canonical],"warsaw")?.row).toBe(canonical);
  expect(resolveCityRoute([a,b],"warsaw")).toBeNull();
  expect(resolveCityRoute([a],"---")).toBeNull();
 });
});
