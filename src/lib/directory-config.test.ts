import {describe,expect,it} from "vitest";
import {configuredPaidCity,directoryConfig} from "./directory-config";

describe("operator-confirmed paid city inventory",()=>{
 it("contains London and Würzburg without inferring pilots or requested tiers",()=>{
  expect(Object.values(directoryConfig.paidCities).map(city=>city.slug).sort()).toEqual(["london","wuerzburg"]);
  expect(directoryConfig.paidCities["ca2f9905-fb4d-4948-a12c-c792b28ec7c8"]).toMatchObject({slug:"london",subdomainReady:true});
  expect(directoryConfig.paidCities["8e136ccb-923b-41aa-a6d1-1290b0b3a014"]).toMatchObject({slug:"wuerzburg",cityName:"Würzburg",aliases:["wurzburg"],subdomainReady:false});
 });
 it("recognizes a staging record by canonical slug or legacy alias",()=>{
  expect(configuredPaidCity("different-staging-id",["wuerzburg"])?.cityName).toBe("Würzburg");
  expect(configuredPaidCity("different-staging-id",["wurzburg"])?.cityName).toBe("Würzburg");
 });
});
