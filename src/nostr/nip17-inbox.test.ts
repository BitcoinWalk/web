import {finalizeEvent,generateSecretKey,getPublicKey,nip44,type Event} from "nostr-tools";
import {wrapEvent} from "nostr-tools/nip59";
import {describe,expect,it,vi} from "vitest";
import {readNip17Wraps,unwrapNip17Message} from "./nip17-inbox";

function decryptWith(secret:Uint8Array){return async(peer:string,ciphertext:string)=>nip44.v2.decrypt(ciphertext,nip44.v2.utils.getConversationKey(secret,peer));}

describe("NIP-17 inbox",()=>{
 it("waits for a slow remote signer instead of dropping its inbox after nine seconds",async()=>{
  vi.useFakeTimers();
  try{
   const key=generateSecretKey(),pubkey=getPublicKey(key),event=wrapEvent({kind:14,tags:[["p",pubkey]],content:"Reply"},generateSecretKey(),pubkey);
   const pool={subscribeEose:vi.fn((_relays,_filter,handlers)=>{queueMicrotask(()=>{void handlers.onauth({kind:22242,created_at:1,tags:[["relay","wss://one.example/"],["challenge","test"]],content:""}).then(()=>{handlers.onevent(event);handlers.onclose([{reason:"closed automatically on eose"}]);}).catch(()=>{});});return {close:vi.fn()};})};
   const pending=readNip17Wraps(pool,pubkey,["wss://one.example/"],async template=>{await new Promise(resolve=>setTimeout(resolve,12000));return finalizeEvent(template,key);});
   const checked=expect(pending).resolves.toEqual([event]);await vi.advanceTimersByTimeAsync(12500);await checked;
  }finally{vi.useRealTimers();}
 });
 it("distinguishes envelope validation, both decryptions, and decrypted data validation without exposing signer errors",async()=>{
  const sender=generateSecretKey(),receiver=generateSecretKey(),recipient=getPublicKey(receiver);
  const wrap=wrapEvent({kind:14,tags:[["p",recipient]],content:"Private Guide reply"},sender,recipient);
  await expect(unwrapNip17Message({...wrap,kind:1},recipient,vi.fn())).rejects.toMatchObject({stage:"gift-wrap-validation"});
  for(const stage of ["gift-wrap-decryption","seal-validation","message-decryption","message-validation"]){
   let calls=0;
   const decrypt=async(peer:string,ciphertext:string)=>{
    calls++;
    if(stage==="gift-wrap-decryption"||stage==="message-decryption"&&calls===2)throw new Error("SECRET signer response");
    if(stage==="seal-validation"||stage==="message-validation"&&calls===2)return "SECRET invalid decrypted content";
    return decryptWith(receiver)(peer,ciphertext);
   };
   const error=await unwrapNip17Message(wrap,recipient,decrypt).catch(error=>error);
   expect(error.stage).toBe(stage);expect(error.message).not.toContain("SECRET");
  }
 });
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

 it("authenticates and retries the Damus-prefixed refusal once",async()=>{
  const pubkey=getPublicKey(generateSecretKey()),onauth=vi.fn(),auth=vi.fn(async()=>{});
  let reads=0;
  const pool={ensureRelay:vi.fn(async()=>({auth}) as unknown as Awaited<ReturnType<import("nostr-tools").SimplePool["ensureRelay"]>>),subscribeEose:vi.fn((_relays,_filter,handlers)=>{queueMicrotask(()=>handlers.onclose([{reason:++reads===1?"ERROR: auth-required: requested filter requires authentication":"closed automatically on eose"}]));return {close:vi.fn()};})};
  await expect(readNip17Wraps(pool,pubkey,["wss://relay.damus.io/"],onauth)).resolves.toEqual([]);
  expect(auth).toHaveBeenCalledOnce();expect(reads).toBe(2);
 });

 it("does not repeatedly prompt when the authenticated retry is refused",async()=>{
  const pubkey=getPublicKey(generateSecretKey()),auth=vi.fn(async()=>{});
  const pool={ensureRelay:vi.fn(async()=>({auth}) as unknown as Awaited<ReturnType<import("nostr-tools").SimplePool["ensureRelay"]>>),subscribeEose:vi.fn((_relays,_filter,handlers)=>{queueMicrotask(()=>handlers.onclose([{reason:"ERROR: auth-required: requested filter requires authentication"}]));return {close:vi.fn()};})};
  await expect(readNip17Wraps(pool,pubkey,["wss://relay.damus.io/"],vi.fn())).rejects.toThrow(/no inbox relay completed/);
  expect(auth).toHaveBeenCalledOnce();expect(pool.subscribeEose).toHaveBeenCalledTimes(2);
 });

 it("streams only completed relay batches without waiting for another relay",async()=>{
  const pubkey=getPublicKey(generateSecretKey()),batch=vi.fn(),incomplete=vi.fn();let completeSlow!:()=>void;
  const pool={subscribeEose:vi.fn((relays:string[],_filter,handlers)=>{if(relays[0].includes("slow"))completeSlow=()=>handlers.onclose([{reason:"connection failed"}]);else queueMicrotask(()=>handlers.onclose([{reason:"closed automatically on eose"}]));return {close:vi.fn()};})};
  const pending=readNip17Wraps(pool,pubkey,["wss://fast.example","wss://slow.example"],undefined,batch,incomplete);
  await vi.waitFor(()=>expect(batch).toHaveBeenCalledOnce());completeSlow();await expect(pending).resolves.toEqual([]);
  expect(incomplete).toHaveBeenCalledExactlyOnceWith(["wss://slow.example"]);
 });
 it("bounds an unanswered signer request and ignores a late approval",async()=>{
  vi.useFakeTimers();
  try{
   const key=generateSecretKey(),pubkey=getPublicKey(key);let approve!:()=>void;const close=vi.fn();
   const pool={subscribeEose:vi.fn((_relays,_filter,handlers)=>{queueMicrotask(()=>{void handlers.onauth({kind:22242,created_at:1,tags:[],content:""}).then(()=>handlers.onclose([{reason:"closed automatically on eose"}])).catch(()=>{});});return {close};})};
   const checked=expect(readNip17Wraps(pool,pubkey,["wss://slow.example"],async template=>{await new Promise<void>(resolve=>{approve=resolve;});return finalizeEvent(template,key);})).rejects.toThrow(/no inbox relay completed/);
   await vi.advanceTimersByTimeAsync(60001);await checked;approve();await vi.advanceTimersByTimeAsync(1);expect(close).toHaveBeenCalledOnce();
  }finally{vi.useRealTimers();}
 });
});
