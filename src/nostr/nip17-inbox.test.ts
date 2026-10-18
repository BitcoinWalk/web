import {generateSecretKey,getPublicKey,nip44,type Event} from "nostr-tools";
import {wrapEvent} from "nostr-tools/nip59";
import {describe,expect,it,vi} from "vitest";
import {readNip17Wraps,unwrapNip17Message} from "./nip17-inbox";

function decryptWith(secret:Uint8Array){return async(peer:string,ciphertext:string)=>nip44.v2.decrypt(ciphertext,nip44.v2.utils.getConversationKey(secret,peer));}

describe("NIP-17 inbox",()=>{
 it("opens a valid NIP-59 wrapped kind-14 message",async()=>{
  const sender=generateSecretKey(),receiver=generateSecretKey(),recipient=getPublicKey(receiver),created_at=1_700_000_000;
  const wrap=wrapEvent({kind:14,created_at,tags:[["p",recipient]],content:"Guide update"},sender,recipient);
  await expect(unwrapNip17Message(wrap,recipient,decryptWith(receiver))).resolves.toMatchObject({pubkey:getPublicKey(sender),content:"Guide update",createdAt:created_at,wrapId:wrap.id});
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
});
