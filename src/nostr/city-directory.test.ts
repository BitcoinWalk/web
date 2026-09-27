import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {
  CITY_DIRECTORY_KIND,
  createCityDirectoryRoot,
  discoverExistingCityDirectoryRoot,
  normalizeDirectoryRelays,
  selectExistingCityDirectoryRoot,
  verifySignedCityDirectoryTemplate,
  type CityDirectoryRootInput,
} from "./city-directory";

const cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f";
const ownerSecret=generateSecretKey(),owner=getPublicKey(ownerSecret);
const recovery=getPublicKey(generateSecretKey()),operator=getPublicKey(generateSecretKey());
const input:CityDirectoryRootInput={cityId,ownerPubkey:owner,operatorPubkeys:[operator],recoveryPubkey:recovery,primaryRelay:"wss://city.example",mirrorRelays:["wss://mirror.example/"]};

describe("city endpoint directory root",()=>{
  it("creates the exact portable root accepted by the relay resolver",()=>{
    const template=createCityDirectoryRoot(input,1234);
    expect(template.kind).toBe(CITY_DIRECTORY_KIND);
    expect(template.created_at).toBe(1234);
    expect(template.tags).toEqual([
      ["d",cityId],["i",cityId],["sequence","0"],["action","establish"],
      ["p",owner,"","owner"],["p",operator,"","operator"],["p",recovery,"","recovery"],
      ["r","wss://city.example/","primary"],["r","wss://mirror.example/","mirror"],
    ]);
    expect(JSON.parse(template.content)).toEqual({version:1,cityId,sequence:0,action:"establish",previousEventId:"",ownerPubkey:owner,operatorPubkeys:[operator],recoveryPubkeys:[recovery],publicRelays:[{url:"wss://city.example/",role:"primary"},{url:"wss://mirror.example/",role:"mirror"}]});
  });

  it("rejects unsafe authority and endpoint input before a signature is requested",()=>{
    expect(()=>createCityDirectoryRoot({...input,ownerPubkey:getPublicKey(generateSecretKey())})).not.toThrow();
    expect(()=>createCityDirectoryRoot({...input,recoveryPubkey:owner})).toThrow("distinct");
    expect(()=>createCityDirectoryRoot({...input,mirrorRelays:["wss://city.example/"]})).toThrow("unique");
    expect(()=>createCityDirectoryRoot({...input,primaryRelay:"https://city.example"})).toThrow("WSS");
    expect(()=>createCityDirectoryRoot({...input,primaryRelay:"wss://city.example/path"})).toThrow("root");
  });

  it("rejects a signer that changes any requested field or uses another identity",()=>{
    const template=createCityDirectoryRoot(input,1234);
    const signed=finalizeEvent(structuredClone(template),ownerSecret);
    expect(verifySignedCityDirectoryTemplate(signed,template,owner)).toBe(signed);
    const changed=finalizeEvent({...structuredClone(template),content:template.content+" "},ownerSecret);
    expect(()=>verifySignedCityDirectoryTemplate(changed,template,owner)).toThrow("exact event");
    const outsider=finalizeEvent(structuredClone(template),generateSecretKey());
    expect(()=>verifySignedCityDirectoryTemplate(outsider,template,owner)).toThrow("owner");
  });
});

describe("directory discovery relays",()=>{
  it("requires two to eight unique normalized root WSS relays",()=>{
    expect(normalizeDirectoryRelays(["wss://one.example","wss://two.example/"])).toEqual(["wss://one.example/","wss://two.example/"]);
    expect(()=>normalizeDirectoryRelays(["wss://one.example/"])).toThrow("two");
    expect(()=>normalizeDirectoryRelays(["wss://one.example","wss://one.example/"])).toThrow("unique");
  });

  it("retains a valid owner root while one configured transport is unavailable",async()=>{
    const root=finalizeEvent(createCityDirectoryRoot(input,1234),ownerSecret);
    const result=await discoverExistingCityDirectoryRoot(
      ["wss://one.example/","wss://two.example/"],
      cityId,
      owner,
      async relay=>relay.includes("one")?[root]:Promise.reject(new Error("offline")),
    );

    expect(result.root).toBe(root);
    expect(result.reachableRelays).toEqual(["wss://one.example/"]);
    expect(result.unavailableRelays).toEqual(["wss://two.example/"]);
  });

  it("does not mistake an incomplete outage read for proof that no root exists",async()=>{
    await expect(discoverExistingCityDirectoryRoot(
      ["wss://one.example/","wss://two.example/"],
      cityId,
      owner,
      async relay=>relay.includes("one")?[]:Promise.reject(new Error("offline")),
    )).rejects.toThrow("cannot prove that no directory root exists");
  });

  it("accepts root absence only when every configured transport completed",async()=>{
    const result=await discoverExistingCityDirectoryRoot(
      ["wss://one.example/","wss://two.example/"],
      cityId,
      owner,
      async()=>[],
    );

    expect(result.root).toBeNull();
    expect(result.reachableRelays).toHaveLength(2);
    expect(result.unavailableRelays).toEqual([]);
  });

  it("fails closed when reachable transports contain conflicting valid owner roots",async()=>{
    const first=finalizeEvent(createCityDirectoryRoot(input,1234),ownerSecret);
    const second=finalizeEvent(createCityDirectoryRoot({...input,primaryRelay:"wss://other.example/"},1235),ownerSecret);

    await expect(discoverExistingCityDirectoryRoot(
      ["wss://one.example/","wss://two.example/"],
      cityId,
      owner,
      async relay=>relay.includes("one")?[first]:[second],
    )).rejects.toThrow("conflicting");
  });
});

describe("partial root publication recovery",()=>{
  it("selects one exact owner root while ignoring outsider noise",()=>{
    const template=createCityDirectoryRoot(input,1234),root=finalizeEvent(structuredClone(template),ownerSecret);
    const noise=finalizeEvent(structuredClone(template),generateSecretKey());
    expect(selectExistingCityDirectoryRoot([noise,root,root],cityId,owner)).toBe(root);
  });

  it("fails closed on conflicting valid owner roots and rejects malformed owner scope",()=>{
    const first=finalizeEvent(createCityDirectoryRoot(input,1234),ownerSecret);
    const second=finalizeEvent(createCityDirectoryRoot({...input,primaryRelay:"wss://other.example/"},1235),ownerSecret);
    expect(()=>selectExistingCityDirectoryRoot([first,second],cityId,owner)).toThrow("conflicting");
    const malformed=finalizeEvent({...createCityDirectoryRoot(input,1234),content:"{}"},ownerSecret);
    expect(selectExistingCityDirectoryRoot([malformed],cityId,owner)).toBeNull();
  });
});
