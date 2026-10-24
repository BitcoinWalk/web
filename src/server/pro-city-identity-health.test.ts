import {describe,expect,it} from "vitest";
import {DatabaseSync} from "node:sqlite";
import {managedIdentityIdentifier} from "./pro-city-identity-health";
import {identityApprovalProblems} from "../domain/identity-review";
import {classifyCityIdentityTier,identityHealthPubkey,managedCityProfileMatches,provisioningStatusCityId,summarizeCityIdentityHealth,type CityIdentityHealthEvidence} from "./pro-city-identity-health";

const base=(overrides:Partial<CityIdentityHealthEvidence>={}):CityIdentityHealthEvidence=>({
 cityId:"11111111-1111-4111-8111-111111111111",cityName:"Madeira",slug:"madeira",availableInEnvironment:true,tier:"pro",checkedAt:100,
 task:{cityId:"11111111-1111-4111-8111-111111111111",state:"ready-for-proof",signer:{pubkey:"a".repeat(64),version:1,confirmedAt:80},createdAt:1,updatedAt:90},
 active:{eventId:"b".repeat(64),verifiedAt:85,challenge:{binding:{brandPubkey:"a".repeat(64)},profile:{}} as never},activationState:"active",preparedBrandPubkey:"a".repeat(64),binding:"pass",
 profile:{reachable:3,matching:3,nip05:3,lightning:3},capabilities:{overall:"active",nip05:"active",lightning:"active",retryable:false,detail:"verified"},nip05Verified:true,activationUpdatedAt:95,...overrides,
});

describe("Pro city identity health",()=>{
 it("uses the managed address rather than Hannover's legacy page slug",()=>{
  const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE rustress_activation_task(city TEXT,activation_config TEXT)");
  db.prepare("INSERT INTO rustress_activation_task VALUES(?,?)").run("city",JSON.stringify({brandPubkey:"a".repeat(64),domain:"bitcoinwalk.org",localPart:"hannover"}));
  expect(managedIdentityIdentifier(db,"city","a".repeat(64),"hanover")).toBe("hannover@bitcoinwalk.org");
  expect(managedIdentityIdentifier(db,"city","b".repeat(64),"hanover")).toBe("hanover@bitcoinwalk.org");db.close();
 });
 it("retains failed service evidence without generating an approval request",()=>{
  const row=summarizeCityIdentityHealth(base({nip05Verified:false,profile:{reachable:3,matching:3,nip05:0,lightning:0},capabilities:{overall:"needs-attention",nip05:"needs-attention",lightning:"needs-attention",retryable:true,detail:"failed"}}));
  expect(row.status).toBe("action-required");expect(identityApprovalProblems(row)).toEqual([]);
 });
 it("accepts appearance without overriding failed binding or service evidence",()=>{
  const row=summarizeCityIdentityHealth(base({binding:"fail",profile:{reachable:3,matching:0,nip05:0,lightning:0},nip05Verified:false,profilePreview:{fingerprint:"a".repeat(64),pubkey:"a".repeat(64),name:"Custom",picture:"https://bitcoinwalk.org/avatar.webp",website:"https://bitcoinwalk.org/madeira",eligible:true,accepted:true}}));
  expect(row.checks.find(check=>check.key==="profile")?.state).toBe("pass");
  expect(identityApprovalProblems(row).map(check=>check.key)).toEqual(["binding"]);
  expect(row.checks.find(check=>check.key==="nip05")?.state).toBe("fail");
 });
 it("recognizes reviewed public identity without completing private onboarding",()=>{
  const row=summarizeCityIdentityHealth(base({task:null,active:null,preparedBrandPubkey:undefined,activationState:undefined,binding:"fail",capabilities:{overall:"setup-required",nip05:"setup-required",lightning:"setup-required",retryable:false,detail:"Not activated"},nip05Verified:true}));
  expect(row.checks.filter(check=>check.state==="pass").map(check=>check.key)).toEqual(["profile","nip05"]);
  expect(row.checks.filter(check=>check.state==="fail").map(check=>check.key)).toEqual(["identity","lightning","binding","recovery"]);
 });
 it("uses named mappings only as a fallback, never over a recorded signer",()=>{
  expect(identityHealthPubkey(null,null,null,"c".repeat(64))).toBe("c".repeat(64));
  expect(identityHealthPubkey(base().active,null,null,"c".repeat(64))).toBe("a".repeat(64));
  expect(identityHealthPubkey(null,{brandPubkey:"b".repeat(64)},base().task,"c".repeat(64))).toBe("b".repeat(64));
  expect(identityHealthPubkey(null,null,base().task,"c".repeat(64))).toBe("a".repeat(64));
  expect(identityHealthPubkey(null,null,null)).toBeUndefined();
 });
 it("verifies a conventional profile before binding, but requires the canonical website",()=>{
  const profile={name:"BitcoinWalk Hannover",picture:"https://bitcoinwalk.org/hannover.jpg",website:"https://bitcoinwalk.org/hannover"};
  expect(managedCityProfileMatches(profile,null,"Hannover",profile.website)).toBe(true);
  expect(managedCityProfileMatches({...profile,name:"Other"},null,"Hannover",profile.website)).toBe(false);
  expect(managedCityProfileMatches({...profile,website:"https://example.com"},null,"Hannover",profile.website)).toBe(false);
  expect(managedCityProfileMatches(profile,null,"Hannover")).toBe(false);
  expect(managedCityProfileMatches({...profile,picture:undefined},null,"Hannover",profile.website)).toBe(false);
 });
 it("does not pass NIP-05 merely because provisioning says active",()=>{
  expect(summarizeCityIdentityHealth(base({nip05Verified:false,profile:{reachable:3,matching:3,nip05:0,lightning:3}})).checks.find(check=>check.key==="nip05")?.state).toBe("fail");
 });
 it("does not reopen an activated mapping after one transient probe failure when public profiles corroborate it",()=>{
  const row=summarizeCityIdentityHealth(base({nip05Verified:false,profile:{reachable:3,matching:3,nip05:2,lightning:3}}));
  expect(row.status).toBe("complete");
  expect(row.checks.find(check=>check.key==="nip05")?.state).toBe("pass");
 });
 it("keeps confirmed London/Würzburg Pro while separating staging test evidence",()=>{
  expect(classifyCityIdentityTier({operatorConfirmed:true,settled:false,hasSetup:false,hasActiveBinding:false,staging:true})).toBe("pro");
  expect(classifyCityIdentityTier({operatorConfirmed:false,settled:true,hasSetup:true,hasActiveBinding:true,staging:true})).toBe("pilot");
  expect(classifyCityIdentityTier({operatorConfirmed:false,settled:true,hasSetup:true,hasActiveBinding:true,staging:false})).toBe("pro");
 });
 it("reads a canonical Madeira city's completed services from its retained provisioning identity",()=>{
  expect(provisioningStatusCityId("83f15504-9fca-4d59-a0f6-616a559510df",["madeira"])).toBe("ca20993a-5b7f-443e-931e-8dbaa61d05fe");
  expect(provisioningStatusCityId("ca2f9905-fb4d-4948-a12c-c792b28ec7c8",["london"])).toBe("ca2f9905-fb4d-4948-a12c-c792b28ec7c8");
  expect(provisioningStatusCityId("11111111-1111-4111-8111-111111111111",["unknown"])).toBe("11111111-1111-4111-8111-111111111111");
 });
 it("marks complete identity evidence without making future city publishing a blocker",()=>{
  const row=summarizeCityIdentityHealth(base());
  expect(row.status).toBe("complete");
  expect(row.checks.find(check=>check.key==="publishing")?.state).toBe("future");
 expect(row.lastVerifiedAt).toBe(95);
 });
 it("assigns an approved unpublished identity to the super-admin rather than the host",()=>{
  const row=summarizeCityIdentityHealth(base({active:null,activationState:"approved",preparedBrandPubkey:"a".repeat(64),binding:"fail",profile:{reachable:3,matching:0,nip05:0,lightning:0},capabilities:{overall:"setup-required",nip05:"setup-required",lightning:"setup-required",retryable:false,detail:"Awaiting publication."},nip05Verified:false}));
  expect(row.activationState).toBe("approved");
  expect(row.status).toBe("action-required");
  expect(row.checks.find(check=>check.key==="identity")).toMatchObject({state:"pass",detail:expect.stringContaining("submitted")});
  expect(row.checks.find(check=>check.key==="binding")?.state).toBe("fail");
 });
 it("keeps a confirmed signer complete when its activation request expires",()=>{
  const row=summarizeCityIdentityHealth(base({active:null,activationState:"expired",preparedBrandPubkey:"a".repeat(64),binding:"fail"}));
  expect(row.checks.find(check=>check.key==="identity")).toMatchObject({state:"pass",detail:expect.stringContaining("saved city signer")});
  expect(row.checks.find(check=>check.key==="binding")).toMatchObject({state:"fail",detail:expect.stringContaining("expired")});
 });
 it("does not reopen verified managed services because profile relays lag optional fields",()=>{
  const row=summarizeCityIdentityHealth(base({profile:{reachable:3,matching:3,nip05:0,lightning:0}}));
  expect(row.status).toBe("complete");
  expect(row.checks.find(check=>check.key==="nip05")?.state).toBe("pass");
  expect(row.checks.find(check=>check.key==="lightning")?.state).toBe("pass");
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
  expect(managedCityProfileMatches({name:"BitcoinWalk London",picture:"https://blossom.primal.net/london.jpg",website:"https://bitcoinwalk.org/london"},{...active!,challenge:{...active!.challenge,profile:{...active!.challenge.profile,website:"https://app-staging.bitcoinwalk.org/london"}}},"London","https://bitcoinwalk.org/london")).toBe(true);
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
