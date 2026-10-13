import {finalizeEvent,generateSecretKey,type Event} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {inspectArmadaGroup} from "./inspect";

const key=generateSecretKey(),groupId="london-community";
function metadata(tags:string[][]=[],content=""){return finalizeEvent({kind:39000,created_at:100,tags:[["d",groupId],["name","BitcoinWalk London"],["closed"],...tags],content},key);}
const options=(events:Event[])=>({query:async()=>events,relayIdentity:async()=>metadata().pubkey});

describe("Armada group inspection",()=>{
 it("accepts relay-signed public Armada metadata including Buzz's closed membership tag",async()=>{const result=await inspectArmadaGroup("wss://london.bitcoinwalk.org/",groupId,options([metadata()]));expect(result).toMatchObject({name:"BitcoinWalk London",metadataEventId:expect.stringMatching(/^[0-9a-f]{64}$/),publiclyReadable:true,openJoin:true});});
 it.each([["private"],["hidden"]])("rejects %s groups",async tag=>{await expect(inspectArmadaGroup("wss://london.bitcoinwalk.org/",groupId,options([metadata([[tag]])]))).rejects.toThrow("No signed public open-join");});
 it("rejects the wrong group, wrong signer, missing name and invalid relays",async()=>{const wrong=finalizeEvent({kind:39000,created_at:100,tags:[["d","other"],["name","Other"]],content:""},key),unsignedByRelay=metadata(),missingName=finalizeEvent({kind:39000,created_at:100,tags:[["d",groupId]],content:""},key);for(const event of [wrong,missingName] as Event[])await expect(inspectArmadaGroup("wss://london.bitcoinwalk.org/",groupId,options([event]))).rejects.toThrow("No signed public open-join");await expect(inspectArmadaGroup("wss://london.bitcoinwalk.org/",groupId,{query:async()=>[unsignedByRelay],relayIdentity:async()=>"f".repeat(64)})).rejects.toThrow("No signed public open-join");await expect(inspectArmadaGroup("wss://example.com/",groupId,{query:async()=>[]})).rejects.toThrow("relay is invalid");});
});
