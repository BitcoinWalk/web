import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {describe,expect,it,vi} from "vitest";
import {confirmCityDirectoryEvent,createCityDirectoryRoot,publishAndConfirmCityDirectoryRoot} from "./city-directory";

const secret=generateSecretKey(),owner=getPublicKey(secret);
const template=createCityDirectoryRoot({cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",ownerPubkey:owner,operatorPubkeys:[],recoveryPubkey:getPublicKey(generateSecretKey()),primaryRelay:"wss://city.example/",mirrorRelays:[]},100);
const event=finalizeEvent(structuredClone(template),secret);
const relays=["wss://discovery-one.example/","wss://discovery-two.example/"];

describe("city endpoint directory publication",()=>{
  it("publishes the same event to every mirror and reads it back independently",async()=>{
    const publish=vi.fn().mockResolvedValue({accepted:relays,rejected:[]});
    const read=vi.fn(async(relay:string)=>relay===relays[0]?[event]:[structuredClone(event)]);
    await expect(publishAndConfirmCityDirectoryRoot(event,relays,publish,read)).resolves.toEqual({eventId:event.id,relays});
    expect(publish).toHaveBeenCalledWith(event,relays,2);
    expect(read.mock.calls.map(call=>call[0])).toEqual(relays);
  });

  it("fails closed when publication or exact independent read-back is incomplete",async()=>{
    const read=vi.fn().mockResolvedValue([event]);
    await expect(publishAndConfirmCityDirectoryRoot(event,relays,vi.fn().mockRejectedValue(new Error("1/2")),read)).rejects.toThrow("1/2");
    await expect(publishAndConfirmCityDirectoryRoot(event,relays,vi.fn().mockResolvedValue({accepted:relays,rejected:[]}),vi.fn(async relay=>relay===relays[0]?[event]:[]))).rejects.toThrow("read back");
  });
  it("confirms an already-delivered exact event without publishing it again",async()=>{
    const read=vi.fn().mockResolvedValue([event]);
    await expect(confirmCityDirectoryEvent(event,relays,read)).resolves.toEqual({eventId:event.id,relays});
    expect(read).toHaveBeenCalledTimes(2);
  });
});
