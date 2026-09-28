import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {
  CITY_DIRECTORY_KIND,
  createCityDirectoryRoot,
  createCityDirectoryOperatorUpdate,
  createCityDirectoryOwnerUpdate,
  createCityDirectoryRecovery,
  createCityDirectoryRotation,
  discoverCityDirectoryChainForSigning,
  discoverExistingCityDirectoryRoot,
  normalizeDirectoryRelays,
  parseCityDirectoryEvent,
  resolveCityDirectoryChain,
  selectExistingCityDirectoryRoot,
  verifySignedCityDirectorySuccessor,
  verifySignedCityDirectoryTemplate,
  type CityDirectoryRootInput,
} from "./city-directory";

const cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f";
const ownerSecret=generateSecretKey(),owner=getPublicKey(ownerSecret);
const recoverySecret=generateSecretKey(),recovery=getPublicKey(recoverySecret),operatorSecret=generateSecretKey(),operator=getPublicKey(operatorSecret);
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

describe("city endpoint directory successors",()=>{
  const root=finalizeEvent(createCityDirectoryRoot(input,1234),ownerSecret);

  it("creates a monotonic owner update that may change authorities and endpoints",()=>{
    const nextOperator=getPublicKey(generateSecretKey()),nextRecovery=getPublicKey(generateSecretKey());
    const template=createCityDirectoryOwnerUpdate(root,{signerPubkey:owner,operatorPubkeys:[nextOperator],recoveryPubkey:nextRecovery,primaryRelay:"wss://new-city.example/",mirrorRelays:[]},1235);
    const content=parseCityDirectoryEvent(finalizeEvent(template,ownerSecret));
    expect(content).toEqual({version:1,cityId,sequence:1,action:"update",previousEventId:root.id,ownerPubkey:owner,operatorPubkeys:[nextOperator],recoveryPubkeys:[nextRecovery],publicRelays:[{url:"wss://new-city.example/",role:"primary"}]});
    expect(template.tags).toContainEqual(["e",root.id,"","directory-previous"]);
  });

  it("allows a listed operator to change endpoints without accepting authority changes",()=>{
    const template=createCityDirectoryOperatorUpdate(root,{signerPubkey:operator,primaryRelay:"wss://operator-city.example/",mirrorRelays:["wss://operator-mirror.example/"]},1235);
    const signed=finalizeEvent(structuredClone(template),generateSecretKey());
    const operatorSigned=finalizeEvent(structuredClone(template),operatorSecret);
    const content=parseCityDirectoryEvent(operatorSigned);
    expect(content.ownerPubkey).toBe(owner);
    expect(content.operatorPubkeys).toEqual([operator]);
    expect(content.recoveryPubkeys).toEqual([recovery]);
    expect(()=>verifySignedCityDirectorySuccessor(signed,template,operator)).toThrow("required directory authority");
    expect(verifySignedCityDirectorySuccessor(operatorSigned,template,operator)).toBe(operatorSigned);
    expect(()=>createCityDirectoryOperatorUpdate(root,{signerPubkey:getPublicKey(generateSecretKey()),primaryRelay:"wss://other.example/",mirrorRelays:[]},1235)).toThrow("listed operator");
  });

  it("rotates only the owner and removes the old owner's signing authority",()=>{
    const nextOwnerSecret=generateSecretKey(),nextOwner=getPublicKey(nextOwnerSecret);
    const template=createCityDirectoryRotation(root,{signerPubkey:owner,nextOwnerPubkey:nextOwner},1235);
    const rotated=finalizeEvent(template,ownerSecret),content=parseCityDirectoryEvent(rotated);
    expect(content).toEqual({...JSON.parse(root.content),sequence:1,action:"rotate",previousEventId:root.id,ownerPubkey:nextOwner});
    expect(()=>createCityDirectoryOwnerUpdate(rotated,{signerPubkey:owner,operatorPubkeys:[operator],recoveryPubkey:recovery,primaryRelay:"wss://old-owner.example/",mirrorRelays:[]},1236)).toThrow("current owner");
    expect(createCityDirectoryOwnerUpdate(rotated,{signerPubkey:nextOwner,operatorPubkeys:[operator],recoveryPubkey:recovery,primaryRelay:"wss://new-owner.example/",mirrorRelays:[]},1236).created_at).toBe(1236);
  });

  it("lets only the declared recovery identity replace the owner while clearing operators",()=>{
    const recoveredOwner=getPublicKey(generateSecretKey());
    const template=createCityDirectoryRecovery(root,{signerPubkey:recovery,nextOwnerPubkey:recoveredOwner},1235);
    const recovered=finalizeEvent(template,recoverySecret),content=parseCityDirectoryEvent(recovered);
    expect(content.ownerPubkey).toBe(recoveredOwner);
    expect(content.operatorPubkeys).toEqual([]);
    expect(content.recoveryPubkeys).toEqual([recovery]);
    expect(content.publicRelays).toEqual(JSON.parse(root.content).publicRelays);
    expect(()=>createCityDirectoryRecovery(root,{signerPubkey:operator,nextOwnerPubkey:recoveredOwner},1235)).toThrow("recovery identity");
  });

  it("requires every successor timestamp to be later than its predecessor",()=>{
    expect(()=>createCityDirectoryOwnerUpdate(root,{signerPubkey:owner,operatorPubkeys:[operator],recoveryPubkey:recovery,primaryRelay:"wss://city.example/",mirrorRelays:["wss://mirror.example/"]},1234)).toThrow("later than its predecessor");
  });
});

describe("city endpoint directory chain resolution",()=>{
  it("resolves update, rotation and recovery while ignoring a rotated-out owner",()=>{
    const nextOwnerSecret=generateSecretKey(),nextOwner=getPublicKey(nextOwnerSecret),recoveredOwner=getPublicKey(generateSecretKey());
    const root=finalizeEvent(createCityDirectoryRoot(input,1234),ownerSecret);
    const update=finalizeEvent(createCityDirectoryOperatorUpdate(root,{signerPubkey:operator,primaryRelay:"wss://updated.example/",mirrorRelays:[]},1235),operatorSecret);
    const rotate=finalizeEvent(createCityDirectoryRotation(update,{signerPubkey:owner,nextOwnerPubkey:nextOwner},1236),ownerSecret);
    const staleOldOwner=finalizeEvent(createCityDirectoryOwnerUpdate(rotate,{signerPubkey:nextOwner,operatorPubkeys:[operator],recoveryPubkey:recovery,primaryRelay:"wss://stale.example/",mirrorRelays:[]},1237),ownerSecret);
    const recover=finalizeEvent(createCityDirectoryRecovery(rotate,{signerPubkey:recovery,nextOwnerPubkey:recoveredOwner},1238),recoverySecret);
    const state=resolveCityDirectoryChain([staleOldOwner,recover,root,rotate,update],{cityId,rootEventId:root.id,initialOwnerPubkey:owner});
    expect(state.currentEvent).toBe(recover);
    expect(state.content.sequence).toBe(3);
    expect(state.content.ownerPubkey).toBe(recoveredOwner);
    expect(state.content.operatorPubkeys).toEqual([]);
    expect(state.chainLength).toBe(4);
  });

  it("fails closed on two authorized successors of the same current event",()=>{
    const root=finalizeEvent(createCityDirectoryRoot(input,1234),ownerSecret);
    const first=finalizeEvent(createCityDirectoryOwnerUpdate(root,{signerPubkey:owner,operatorPubkeys:[operator],recoveryPubkey:recovery,primaryRelay:"wss://one.example/",mirrorRelays:[]},1235),ownerSecret);
    const second=finalizeEvent(createCityDirectoryOwnerUpdate(root,{signerPubkey:owner,operatorPubkeys:[operator],recoveryPubkey:recovery,primaryRelay:"wss://two.example/",mirrorRelays:[]},1236),ownerSecret);
    expect(()=>resolveCityDirectoryChain([root,first,second],{cityId,rootEventId:root.id,initialOwnerPubkey:owner})).toThrow("conflicting city directory successors");
  });

  it("requires every signing transport to resolve the same current event",async()=>{
    const root=finalizeEvent(createCityDirectoryRoot(input,1234),ownerSecret);
    const update=finalizeEvent(createCityDirectoryOwnerUpdate(root,{signerPubkey:owner,operatorPubkeys:[operator],recoveryPubkey:recovery,primaryRelay:"wss://updated.example/",mirrorRelays:[]},1235),ownerSecret);
    const anchor={cityId,rootEventId:root.id,initialOwnerPubkey:owner};
    const accepted=await discoverCityDirectoryChainForSigning(["wss://one.example/","wss://two.example/"],anchor,async()=>[root,update]);
    expect(accepted.state.currentEvent).toBe(update);
    expect(accepted.relays).toEqual(["wss://one.example/","wss://two.example/"]);
    await expect(discoverCityDirectoryChainForSigning(["wss://one.example/","wss://two.example/"],anchor,async relay=>relay.includes("one")?[root,update]:[root])).rejects.toThrow("do not agree");
    await expect(discoverCityDirectoryChainForSigning(["wss://one.example/","wss://two.example/"],anchor,async relay=>relay.includes("one")?[root,update]:Promise.reject(new Error("offline")))).rejects.toThrow("all configured directory transports");
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
