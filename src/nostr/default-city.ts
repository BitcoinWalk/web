import {SimplePool,getEventHash,verifyEvent,type Event as NostrEvent} from "nostr-tools";
import {decryptWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "./signer";
import {publishVerifiedEvent} from "./relay";

export const DEFAULT_CITY_TAG="bitcoinwalk-default-city-v1";
export const DEFAULT_CITY_RELAYS=["wss://relay.primal.net/","wss://relay.ditto.pub/"];
const revisions=new Map<string,number>();
export function parseDefaultCity(value:string):string {
 const data=JSON.parse(value);
 if(data?.version!==1||typeof data.cityId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.cityId))throw new Error("Invalid default city preference.");
 return data.cityId;
}
export function latestDefaultCity(events:NostrEvent[],pubkey:string):NostrEvent|undefined {
 return events.filter(e=>e.pubkey===pubkey&&e.kind===30078&&e.content.length<4096&&Number.isSafeInteger(e.created_at)&&e.created_at>=0&&e.created_at<=Math.floor(Date.now()/1000)+60&&JSON.stringify(e.tags)===JSON.stringify([["d",DEFAULT_CITY_TAG]])&&getEventHash(e)===e.id&&verifyEvent(e)).sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id))[0];
}
const key=(pubkey:string)=>`${DEFAULT_CITY_TAG}:${pubkey}`;
export function cachedDefaultCity(pubkey:string):string {try{return parseDefaultCity(localStorage.getItem(key(pubkey))||"null");}catch{return "";}}
function cache(pubkey:string,cityId:string){try{localStorage.setItem(key(pubkey),JSON.stringify({version:1,cityId}));}catch{/* Relay copy remains authoritative. */}window.dispatchEvent(new Event("bitcoinwalk-default-city-changed"));}
async function readEvent(pubkey:string){const pool=new SimplePool();try{return latestDefaultCity(await pool.querySync(DEFAULT_CITY_RELAYS,{kinds:[30078],authors:[pubkey],"#d":[DEFAULT_CITY_TAG],limit:5},{maxWait:5000}),pubkey);}finally{pool.close(DEFAULT_CITY_RELAYS);pool.destroy();}}
export async function readDefaultCity(pubkey:string):Promise<string>{
 const revision=revisions.get(pubkey)??0;
 const event=await readEvent(pubkey);if(!event)return cachedDefaultCity(pubkey);
 if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Account changed.");
 const cityId=parseDefaultCity(await decryptWithBrowserExtension(pubkey,event.content));
 if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Account changed.");
 if((revisions.get(pubkey)??0)!==revision)return cachedDefaultCity(pubkey);
 cache(pubkey,cityId);return cityId;
}
export async function saveDefaultCity(pubkey:string,cityId:string):Promise<void>{
 const plaintext=JSON.stringify({version:1,cityId});parseDefaultCity(plaintext);
 if(await getBrowserExtensionPubkey()!==pubkey||!window.nostr?.nip44?.encrypt)throw new Error("Connect this account with a signer supporting private preference sync.");
 const previous=await readEvent(pubkey),content=await window.nostr.nip44.encrypt(pubkey,plaintext);
 const template={kind:30078,created_at:Math.max(Math.floor(Date.now()/1000),(previous?.created_at??0)+1),tags:[["d",DEFAULT_CITY_TAG]],content};
 const event=await signWithBrowserExtension(template);
 if(event.pubkey!==pubkey||getEventHash(event)!==event.id||!verifyEvent(event)||event.content!==content||event.created_at!==template.created_at||event.kind!==30078||JSON.stringify(event.tags)!==JSON.stringify(template.tags)||await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed the preference.");
 await publishVerifiedEvent(event,DEFAULT_CITY_RELAYS,2);
 revisions.set(pubkey,(revisions.get(pubkey)??0)+1);
 cache(pubkey,cityId);
}
