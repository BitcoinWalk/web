import {describe,expect,it} from "vitest";
import {configuredPaidCity,configuredPaidCityEntry,directoryConfig} from "./directory-config";

describe("operator-confirmed paid city inventory",()=>{
 it("contains Madeira, London, Würzburg, Graz and Hanover without inferring pilots or requested tiers",()=>{
  expect(Object.values(directoryConfig.paidCities).map(city=>city.slug).sort()).toEqual(["graz","hannover","london","madeira","wuerzburg"]);
  expect(directoryConfig.paidCities["ca20993a-5b7f-443e-931e-8dbaa61d05fe"]).toMatchObject({slug:"madeira",cityName:"Madeira",subdomainReady:false,relayMode:"dedicated"});
  expect(directoryConfig.paidCities["ca2f9905-fb4d-4948-a12c-c792b28ec7c8"]).toMatchObject({slug:"london",subdomainReady:true,relayMode:"migrated"});
  expect(directoryConfig.paidCities["8e136ccb-923b-41aa-a6d1-1290b0b3a014"]).toMatchObject({slug:"wuerzburg",cityName:"Würzburg",aliases:["wurzburg"],subdomainReady:false});
  expect(directoryConfig.paidCities["e62592ac-a5fc-42df-8f31-94416f6ee8d5"]).toMatchObject({slug:"graz",cityName:"Graz",subdomainReady:false});
  expect(directoryConfig.paidCities["d42123e1-1d01-473b-98e7-846342150eca"]).toMatchObject({slug:"hannover",cityName:"Hannover",aliases:["hanover"],subdomainReady:false,relayMode:"dedicated"});
  expect(configuredPaidCity("legacy-id",["hanover"])?.slug).toBe("hannover");
 });
 it("recognizes a staging record by canonical slug or legacy alias",()=>{
 expect(configuredPaidCity("different-staging-id",["wuerzburg"])?.cityName).toBe("Würzburg");
 expect(configuredPaidCity("different-staging-id",["wurzburg"])?.cityName).toBe("Würzburg");
 expect(configuredPaidCity("different-staging-id",["madeira"])?.cityName).toBe("Madeira");
 expect(configuredPaidCityEntry("different-production-id",["madeira"])).toMatchObject({cityId:"ca20993a-5b7f-443e-931e-8dbaa61d05fe",city:{slug:"madeira"}});
 });
});
