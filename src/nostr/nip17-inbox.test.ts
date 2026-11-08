import {generateSecretKey,getPublicKey,nip44,type Event} from "nostr-tools";
import {wrapEvent} from "nostr-tools/nip59";
import {describe,expect,it,vi} from "vitest";
import {readNip17Wraps,unwrapNip17Message} from "./nip17-inbox";

function decryptWith(secret:Uint8Array){return async(peer:string,ciphertext:string)=>nip44.v2.decrypt(ciphertext,nip44.v2.utils.getConversationKey(secret,peer));}

describe("NIP-17 inbox",()=>{
 it("opens private processing reactions and deletion controls without weakening sender validation",async()=>{
  const sender=generateSecretKey(),receiver=generateSecretKey(),recipient=getPublicKey(receiver),target="a".repeat(64),created_at=Math.floor(Date.now()/1000);
  for(const kind of [7,5]){
   const wrap=wrapEvent({kind,created_at,tags:[["p",recipient],["e",target],["k",kind===7?"14":"7"],["expiration",String(created_at+300)]],content:kind===7?"👀":""},sender,recipient);
   await expect(unwrapNip17Message(wrap,recipient,decryptWith(receiver))).resolves.toMatchObject({kind,target,pubkey:getPublicKey(sender)});
  }
  for(const tags of [[],[["e",target],["k","14"]],[["e",target],["k","14"],["expiration",String(created_at+301)]]]){
   const wrap=wrapEvent({kind:7,created_at,tags:[["p",recipient],...tags],content:"👀"},sender,recipient);
   await expect(unwrapNip17Message(wrap,recipient,decryptWith(receiver))).rejects.toThrow();
  }
 });
 it("opens a valid NIP-59 wrapped kind-14 message",async()=>{
  const sender=generateSecretKey(),receiver=generateSecretKey(),recipient=getPublicKey(receiver),created_at=1_700_000_000;
  const wrap=wrapEvent({kind:14,created_at,tags:[["p",recipient]],content:"Guide update"},sender,recipient);
  await expect(unwrapNip17Message(wrap,recipient,decryptWith(receiver))).resolves.toMatchObject({pubkey:getPublicKey(sender),content:"Guide update",createdAt:created_at,wrapId:wrap.id});
 });

 it("opens the sender copy while preserving its actual recipient",async()=>{
  const sender=generateSecretKey(),recipient=getPublicKey(generateSecretKey()),pubkey=getPublicKey(sender),created_at=1_700_000_001;
  const wrap=wrapEvent({kind:14,created_at,tags:[["p",recipient]],content:"Support request"},sender,pubkey);
  await expect(unwrapNip17Message(wrap,pubkey,decryptWith(sender))).resolves.toMatchObject({pubkey,recipient,content:"Support request",createdAt:created_at});
 });

 it("rejects a wrap addressed to another account before asking the signer",async()=>{
  const sender=generateSecretKey(),receiver=generateSecretKey(),other=generateSecretKey(),recipient=getPublicKey(receiver),decrypt=vi.fn(decryptWith(receiver));
  const wrap=wrapEvent({kind:14,tags:[["p",getPublicKey(other)]],content:"Not yours"},sender,getPublicKey(other));
  await expect(unwrapNip17Message(wrap,recipient,decrypt)).rejects.toThrow(/another account/);
  expect(decrypt).not.toHaveBeenCalled();
 });

 it("requires at least one relay to complete instead of returning a false empty inbox",async()=>{
  const pubkey=getPublicKey(generateSecretKey()),pool={subscribeEose:vi.fn((_relays,_filter,handlers)=>{queueMicrotask(()=>handlers.onclose([{reason:"connection failed"}]));return{close:vi.fn()};})};
  await expect(readNip17Wraps(pool,pubkey,["wss://one.example"])).rejects.toThrow(/no inbox relay completed/);
 });

 it("deduplicates wraps returned by completed relays",async()=>{
  const receiver=generateSecretKey(),pubkey=getPublicKey(receiver),event=wrapEvent({kind:14,tags:[["p",pubkey]],content:"Hello"},generateSecretKey(),pubkey);
  const pool={subscribeEose:vi.fn((_relays,_filter,handlers)=>{queueMicrotask(()=>{handlers.onevent(event as Event);handlers.onclose([{reason:"closed automatically on eose"}]);});return{close:vi.fn()};})};
  await expect(readNip17Wraps(pool,pubkey,["wss://one.example","wss://two.example"])).resolves.toEqual([event]);
 });

 it("streams only completed relay batches without waiting for another relay",async()=>{
  const pubkey=getPublicKey(generateSecretKey()),batch=vi.fn();let completeSlow!:()=>void;
  const pool={subscribeEose:vi.fn((relays:string[],_filter,handlers)=>{if(relays[0].includes("slow"))completeSlow=()=>handlers.onclose([{reason:"connection failed"}]);else queueMicrotask(()=>handlers.onclose([{reason:"closed automatically on eose"}]));return {close:vi.fn()};})};
  const pending=readNip17Wraps(pool,pubkey,["wss://fast.example","wss://slow.example"],undefined,batch);
  await vi.waitFor(()=>expect(batch).toHaveBeenCalledOnce());completeSlow();await expect(pending).resolves.toEqual([]);
 });
});
