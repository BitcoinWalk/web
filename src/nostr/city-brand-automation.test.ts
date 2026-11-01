import {afterEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "./authority";
import {cityBrandAutomationPolicyTemplate,readCityBrandAutomationPolicy} from "./city-brand-automation";
import {readCityBrand} from "./city-brand";

afterEach(()=>vi.unstubAllEnvs());

describe("city identity automation policy",()=>{
 it("requires an exact environment-bound super-admin policy",()=>{
  const key=generateSecretKey(),automation=getPublicKey(generateSecretKey()),input={environment:"staging" as const,automationPubkey:automation,maximumCities:2,issuedAt:1_800_000_000,nonce:"00000000-0000-4000-8000-000000000001"};
  const event=finalizeEvent(cityBrandAutomationPolicyTemplate(input),key);
  expect(readCityBrandAutomationPolicy(event,"staging",getPublicKey(key))).toMatchObject(input);
  expect(()=>readCityBrandAutomationPolicy(event,"production",getPublicKey(key))).toThrow("environment");
  expect(()=>readCityBrandAutomationPolicy({...event,content:event.content+" "},"staging",getPublicKey(key))).toThrow("super-admin");
 });

 it("accepts only an initial binding from the configured dedicated issuer",()=>{
  const key=generateSecretKey(),pubkey=getPublicKey(key),cityId="00000000-0000-4000-8000-000000000001",brand=getPublicKey(generateSecretKey());
  vi.stubEnv("NEXT_PUBLIC_CITY_BRAND_AUTOMATION_PUBKEY",pubkey);
  const make=(sequence:number,previous:string,action:"activate"|"replace")=>{const binding={version:1 as const,cityId,sequence,previous,action,brandPubkey:brand};return finalizeEvent({kind:30312,created_at:10+sequence,tags:[["d",`${cityId}:${sequence}`],["i",cityId],["t","bitcoinwalk-city-brand-v1"]],content:JSON.stringify(binding)},key);};
  expect(readCityBrand(make(0,"","activate"))).toMatchObject({cityId,action:"activate"});
  expect(()=>readCityBrand(make(1,"a".repeat(64),"replace"))).toThrow("only create");
  vi.stubEnv("NEXT_PUBLIC_CITY_BRAND_AUTOMATION_PUBKEY",SUPER_ADMIN_PUBKEY);
  expect(()=>readCityBrand(make(0,"","activate"))).toThrow("dedicated");
 });
});
