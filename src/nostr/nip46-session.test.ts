import {describe,expect,it} from "vitest";
import {NIP46_SESSION_LIFETIME_MS,NIP46_SESSION_STORAGE_KEY,decodeNip46ClientSecret,readNip46Session,saveNip46Session} from "./nip46-session";

function memoryStorage(){
 const values=new Map<string,string>();
 return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},values};
}

const clientSecretKey=new Uint8Array(32).fill(7),bunker={pubkey:"a".repeat(64),relays:["wss://remote.bitcoinwalk.org/"],secret:"one-time-qr-secret"},signerPubkey="b".repeat(64);

describe("bounded NIP-46 browser session",()=>{
 it("retains only the local capability and approved signer route for seven days",()=>{
  const storage=memoryStorage(),now=1_800_000_000_000;
  const saved=saveNip46Session(storage,{clientSecretKey,bunker,signerPubkey},now);
  const raw=storage.values.get(NIP46_SESSION_STORAGE_KEY)!;
  expect(raw).not.toContain("one-time-qr-secret");
  expect(saved.expiresAt-saved.createdAt).toBe(NIP46_SESSION_LIFETIME_MS);
  expect(readNip46Session(storage,now+1)).toEqual(saved);
  expect(decodeNip46ClientSecret(saved.clientSecretHex)).toEqual(clientSecretKey);
 });

 it("removes expired or structurally invalid records",()=>{
  const storage=memoryStorage(),now=1_800_000_000_000;
  saveNip46Session(storage,{clientSecretKey,bunker,signerPubkey},now);
  expect(readNip46Session(storage,now+NIP46_SESSION_LIFETIME_MS)).toBeNull();
  expect(storage.getItem(NIP46_SESSION_STORAGE_KEY)).toBeNull();
  storage.setItem(NIP46_SESSION_STORAGE_KEY,JSON.stringify({version:1,clientSecretHex:"7".repeat(64),bunkerPubkey:"a".repeat(64),signerPubkey:"b".repeat(64),relays:["wss://public.example/"],createdAt:now,expiresAt:now+NIP46_SESSION_LIFETIME_MS}));
  expect(readNip46Session(storage,now+1)).toBeNull();
 });

 it("refuses to persist an unapproved relay",()=>{
  const storage=memoryStorage();
  expect(()=>saveNip46Session(storage,{clientSecretKey,bunker:{...bunker,relays:["wss://public.example/"]},signerPubkey})).toThrow("session is invalid");
  expect(storage.getItem(NIP46_SESSION_STORAGE_KEY)).toBeNull();
 });
});
