import {describe,it,expect} from "vitest";
import {proProfileOutcomes} from "./pro-profile-outcomes";
import type {CityIdentityHealth} from "../server/pro-city-identity-health";
const row=(cityId:string,status:CityIdentityHealth["status"]="complete",extra:Partial<CityIdentityHealth>={}):CityIdentityHealth=>({cityId,cityName:"Private city",slug:"private-city",tier:"pro",availableInEnvironment:true,status,checkedAt:100,checks:[],...extra});
describe("verified Pro profile aggregates",()=>{
 it("separates completion, incomplete and unknown checks and excludes Basic, pilot and unavailable cities",()=>{
  const result=proProfileOutcomes([row("a"),row("b","action-required"),row("c","not-configured"),row("d","unknown"),row("e","complete",{tier:"pilot"}),row("f","complete",{tier:"basic"}),row("g","complete",{availableInEnvironment:false})],101);
  expect(result).toEqual({checked:4,complete:1,actionRequired:2,unknown:1,checkedAt:101});expect(JSON.stringify(result)).not.toMatch(/Private|private-city|cityId|slug/);
 });
 it("deduplicates retries and treats conflicting evidence as unknown",()=>{expect(proProfileOutcomes([row("a"),row("a"),row("b"),row("b","unknown")],100)).toEqual({checked:2,complete:1,actionRequired:0,unknown:1,checkedAt:100});});
 it("does not invent a completion when there are no eligible cities",()=>{expect(proProfileOutcomes([],100)).toEqual({checked:0,complete:0,actionRequired:0,unknown:0,checkedAt:100});});
});
