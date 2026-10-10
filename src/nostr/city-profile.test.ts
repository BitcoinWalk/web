import {describe, expect, it} from "vitest";
import {finalizeEvent, generateSecretKey, getPublicKey} from "nostr-tools";
import {authorizeCityProfile, cityProfileTemplate} from "./city-profile";

const managed={name:"BitcoinWalk in Madeira",picture:"https://bitcoinwalk.org/avatar.webp",banner:"https://bitcoinwalk.org/banner.webp",
  website:"https://bitcoinwalk.org/madeira",nip05:"madeira@bitcoinwalk.org"};

describe("managed city profile",()=>{
  it("preserves unrelated simple fields but replaces managed and stale payment fields",()=>{
    const previous=finalizeEvent({kind:0,created_at:1,tags:[],content:JSON.stringify({about:"Local walkers",name:"Old",nip05:"wrong@example.com",
      lud16:"stale@example.com",lud06:"lnurl1stale",nested:{secret:"drop"}})},generateSecretKey());
    const template=cityProfileTemplate(managed,previous,2),body=JSON.parse(template.content);
    expect(body).toEqual({...managed,display_name:managed.name,about:"Local walkers"});
    expect(body).not.toHaveProperty("lud16");expect(body).not.toHaveProperty("lud06");expect(body).not.toHaveProperty("nested");
  });
  it("adds the Lightning address only when independently enabled",()=>{
    const body=JSON.parse(cityProfileTemplate({...managed,lud16:"madeira@bitcoinwalk.org"},undefined,2).content);
    expect(body.lud16).toBe("madeira@bitcoinwalk.org");
  });
  it("accepts only the exact city-signed template",()=>{
    const secret=generateSecretKey(),template=cityProfileTemplate(managed,undefined,2),signed=finalizeEvent(template,secret);
    expect(authorizeCityProfile(signed,getPublicKey(secret),template).id).toBe(signed.id);
    expect(()=>authorizeCityProfile({...signed,content:"{}"},getPublicKey(secret),template)).toThrow("changed");
  });
});
