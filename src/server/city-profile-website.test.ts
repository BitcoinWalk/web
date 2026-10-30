import {describe,expect,it} from "vitest";
import {cityProfilePreviewEligible,managedCityProfileMatches,sameCityProfileWebsite} from "./pro-city-identity-health";

const canonical="https://bitcoinwalk.org/bangkok";
describe("city profile website equivalence",()=>{
 it("accepts Bangkok's signed trailing-slash profile without rewriting it",()=>{
  const profile={name:"BitcoinWalk Bangkok",picture:"https://example.com/avatar.jpg",website:`${canonical}/`};
  expect(sameCityProfileWebsite(profile.website,canonical)).toBe(true);
  expect(sameCityProfileWebsite(canonical,profile.website)).toBe(true);
  expect(managedCityProfileMatches(profile,null,"Bangkok",canonical)).toBe(true);
  expect(cityProfilePreviewEligible("pass",2,profile.website,canonical,canonical)).toBe(true);
  expect(profile.website).toBe(`${canonical}/`);
 });
 it("still requires a verified binding and two matching relay profiles",()=>{
  for(const binding of ["fail","unknown"]){
   expect(cityProfilePreviewEligible(binding,2,`${canonical}/`,canonical,canonical)).toBe(false);
  }
  expect(cityProfilePreviewEligible("pass",1,`${canonical}/`,canonical,canonical)).toBe(false);
 });
 it.each([
  "https://example.com/bangkok/","http://bitcoinwalk.org/bangkok/",
  "https://bitcoinwalk.org/madeira/","https://bitcoinwalk.org/bangkok/walk/",
  `${canonical}?other=1`,`${canonical}#other`,`${canonical}//`,
  "https://user@bitcoinwalk.org/bangkok/","https://bitcoinwalk.org:444/bangkok/",
  "not a URL",undefined,
 ])("rejects a different or malformed website: %s",website=>{
  expect(sameCityProfileWebsite(website,canonical)).toBe(false);
 });
});
