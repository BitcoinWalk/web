import type {BunkerPointer} from "nostr-tools/nip46";
import {NIP46_PAIRING_RELAYS} from "./nip46-pairing";

export const NIP46_SESSION_STORAGE_KEY="bitcoinwalk:nip46-session:v1";
export const NIP46_SESSION_LIFETIME_MS=7*24*60*60*1000;

type BrowserStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
export type StoredNip46Session={
 version:1;
 clientSecretHex:string;
 bunkerPubkey:string;
 signerPubkey:string;
 relays:string[];
 createdAt:number;
 expiresAt:number;
};

const hexKey=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);
const allowedRelays=(value:unknown):value is string[]=>Array.isArray(value)&&value.length>0&&value.every(relay=>typeof relay==="string"&&NIP46_PAIRING_RELAYS.includes(relay));
const encodeSecret=(secret:Uint8Array)=>Array.from(secret,byte=>byte.toString(16).padStart(2,"0")).join("");

export function decodeNip46ClientSecret(value:string):Uint8Array{
 if(!hexKey(value))throw new Error("Saved remote-signer key is invalid.");
 return Uint8Array.from(value.match(/../g)!,byte=>Number.parseInt(byte,16));
}

export function saveNip46Session(storage:BrowserStorage,{clientSecretKey,bunker,signerPubkey}:{clientSecretKey:Uint8Array;bunker:BunkerPointer;signerPubkey:string},now=Date.now()):StoredNip46Session{
 if(clientSecretKey.length!==32||!hexKey(bunker.pubkey)||!hexKey(signerPubkey)||!allowedRelays(bunker.relays))throw new Error("Remote-signer session is invalid.");
 const value:StoredNip46Session={version:1,clientSecretHex:encodeSecret(clientSecretKey),bunkerPubkey:bunker.pubkey,signerPubkey,relays:[...bunker.relays],createdAt:now,expiresAt:now+NIP46_SESSION_LIFETIME_MS};
 storage.setItem(NIP46_SESSION_STORAGE_KEY,JSON.stringify(value));
 return value;
}

export function readNip46Session(storage:BrowserStorage,now=Date.now()):StoredNip46Session|null{
 try{
  const raw=storage.getItem(NIP46_SESSION_STORAGE_KEY);if(!raw)return null;
  const value=JSON.parse(raw) as Partial<StoredNip46Session>;
  if(value.version!==1||!hexKey(value.clientSecretHex)||!hexKey(value.bunkerPubkey)||!hexKey(value.signerPubkey)||!allowedRelays(value.relays)||typeof value.createdAt!=="number"||typeof value.expiresAt!=="number"||value.createdAt>now||value.expiresAt<=now||value.expiresAt-value.createdAt!==NIP46_SESSION_LIFETIME_MS)throw new Error("Invalid saved session.");
  return value as StoredNip46Session;
 }catch{storage.removeItem(NIP46_SESSION_STORAGE_KEY);return null;}
}

export function clearNip46Session(storage:BrowserStorage){storage.removeItem(NIP46_SESSION_STORAGE_KEY);}
export function persistNip46Session(storage:BrowserStorage,input:Parameters<typeof saveNip46Session>[1],now=Date.now()){
 const saved=saveNip46Session(storage,input,now),readBack=readNip46Session(storage,now);
 return !!readBack&&readBack.clientSecretHex===saved.clientSecretHex&&readBack.bunkerPubkey===saved.bunkerPubkey&&readBack.signerPubkey===saved.signerPubkey&&JSON.stringify(readBack.relays)===JSON.stringify(saved.relays);
}
export function readBrowserNip46Session(){try{return typeof window==="undefined"?null:readNip46Session(window.localStorage);}catch{return null;}}
export function saveBrowserNip46Session(input:Parameters<typeof saveNip46Session>[1]){try{
 if(typeof window==="undefined")return false;
 return persistNip46Session(window.localStorage,input);
}catch{return false;}}
export function forgetBrowserNip46Session(){try{if(typeof window!=="undefined")clearNip46Session(window.localStorage);}catch{/* A blocked store has nothing usable to clear. */}}
