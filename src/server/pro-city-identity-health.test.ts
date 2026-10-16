import {describe,expect,it} from "vitest";
import {classifyCityIdentityTier,managedCityProfileMatches,summarizeCityIdentityHealth,type CityIdentityHealthEvidence} from "./pro-city-identity-health";

const base=(overrides:Partial<CityIdentityHealthEvidence>={}):CityIdentityHealthEvidence=>({
 cityId:"11111111-1111-4111-8111-111111111111",cityName:"Madeira",slug:"madeira",availableInEnvironment:true,tier:"pro",checkedAt:100,
 task:{cityId:"11111111-1111-4111-8111-111111111111",state:"ready-for-proof",signer:{pubkey:"a".repeat(64),version:1,confirmedAt:80},createdAt:1,updatedAt:90},
 active:{eventId:"b".repeat(64),verifiedAt:85,challenge:{binding:{brandPubkey:"a".repeat(64)},profile:{}} as never},binding:"pass",
 profile:{reachable:3,matching:3,nip05:3,lightning:3},capabilities:{overall:"active",nip05:"active",lightning:"active",retryable:false,detail:"verified"},nip05Verified:true,activationUpdatedAt:95,...overrides,
});

describe("Pro city identity health",()=>{
 it("keeps confirmed London/Würzburg Pro while separating staging test evidence",()=>{
  expect(classifyCityIdentityTier({operatorConfirmed:true,settled:false,hasSetup:false,hasActiveBinding:false,staging:true})).toBe("pro");
  expect(classifyCityIdentityTier({operatorConfirmed:false,settled:true,hasSetup:true,hasActiveBinding:true,staging:true})).toBe("pilot");
  expect(classifyCityIdentityTier({operatorConfirmed:false,settled:true,hasSetup:true,hasActiveBinding:true,staging:false})).toBe("pro");
 });
 it("marks complete identity evidence without making future city publishing a blocker",()=>{
  const row=summarizeCityIdentityHealth(base());
  expect(row.status).toBe("complete");
  expect(row.checks.find(check=>check.key==="publishing")?.state).toBe("future");
  expect(row.lastVerifiedAt).toBe(95);
 });
 it("shows incomplete configured Pro cities as action required",()=>{
  const row=summarizeCityIdentityHealth(base({profile:{reachable:3,matching:1,nip05:1,lightning:3}}));
  expect(row.status).toBe("action-required");
  expect(row.checks.find(check=>check.key==="profile")?.state).toBe("fail");
 });
 it("automatically accepts the exact city signer's conventional name and HTTPS avatar",()=>{
  const active=base().active;
  active!.challenge.profile={name:"BitcoinWalk in London",picture:"https://bitcoinwalk.org/avatar.webp",website:"https://bitcoinwalk.org/london"} as never;
  expect(managedCityProfileMatches({name:"BitcoinWalk London",picture:"https://blossom.primal.net/london.jpg",website:"https://bitcoinwalk.org/london"},active,"London")).toBe(true);
  expect(managedCityProfileMatches({name:"Other London",picture:"https://blossom.primal.net/london.jpg",website:"https://bitcoinwalk.org/london"},active,"London")).toBe(false);
  expect(managedCityProfileMatches({name:"BitcoinWalk London",picture:"https://blossom.primal.net/london.jpg",website:"https://example.com"},active,"London")).toBe(false);
 });
 it("does not treat an external read outage as evidence of failure",()=>{
  const row=summarizeCityIdentityHealth(base({binding:"unknown",profile:{reachable:1,matching:1,nip05:1,lightning:1}}));
  expect(row.status).toBe("unknown");
  expect(row.checks.find(check=>check.key==="binding")?.detail).toContain("not changed");
 });
 it("labels Basic cities not applicable",()=>{
  const row=summarizeCityIdentityHealth(base({tier:"basic",task:null,active:null}));
  expect(row.status).toBe("not-applicable");
  expect(row.checks.every(check=>check.state==="not-applicable")).toBe(true);
 });
 it("keeps an otherwise complete test identity out of the Pro tier",()=>{
  const row=summarizeCityIdentityHealth(base({tier:"pilot",cityName:"Islamabad"}));
  expect(row.tier).toBe("pilot");
  expect(row.status).toBe("complete");
 });
});
