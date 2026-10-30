import {describe, expect, it} from "vitest";
import {finalizeEvent, generateSecretKey, getPublicKey} from "nostr-tools";
import {authorizeCityProfile, cityProfileTemplate, cityProfileAddressesTemplate} from "./city-profile";

const managed={name:"BitcoinWalk in Madeira",picture:"https://bitcoinwalk.org/avatar.webp",banner:"https://bitcoinwalk.org/banner.webp",
  website:"https://bitcoinwalk.org/madeira",nip05:"madeira@bitcoinwalk.org"};

describe("managed city profile",()=>{
  it("updates addresses without replacing the city's existing artwork or biography",()=>{
    const content={name:"Bangkok",display_name:"BitcoinWalk Bangkok",picture:"https://example.com/avatar",banner:"https://example.com/banner",website:"https://bitcoinwalk.org/bangkok/",about:"Our original bio",custom:{keep:true},nip05:"",lud16:"old@primal.net",lud06:"old"};
    const previous=finalizeEvent({kind:0,created_at:100,tags:[],content:JSON.stringify(content)},generateSecretKey());
    const template=cityProfileAddressesTemplate({...managed,lud16:"madeira@bitcoinwalk.org"},previous,100);
    const {lud06:obsolete,...retained}=content;expect(obsolete).toBe("old");
    expect(JSON.parse(template.content)).toEqual({...retained,nip05:managed.nip05,lud16:"madeira@bitcoinwalk.org"});
    expect(template.created_at).toBe(101);
    expect(()=>cityProfileAddressesTemplate(managed,previous)).toThrow("Both city addresses");
    expect(()=>cityProfileAddressesTemplate({...managed,lud16:"madeira@bitcoinwalk.org"},{...previous,content:"{}"})).toThrow("verified");
  });
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
