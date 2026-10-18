import {getEventHash,verifyEvent,type Event,type EventTemplate,type SimplePool,type VerifiedEvent} from "nostr-tools";

export type Nip17Message={id:string;wrapId:string;pubkey:string;content:string;createdAt:number};
type Decrypt=(pubkey:string,ciphertext:string)=>Promise<string>;
type InboxPool=Pick<SimplePool,"subscribeEose">;

const HEX=/^[a-f0-9]{64}$/;
const MAX_CIPHERTEXT=128*1024;
const MAX_CONTENT=16*1024;

function recipient(event:{tags?:unknown},pubkey:string){return Array.isArray(event.tags)&&event.tags.some(tag=>Array.isArray(tag)&&tag[0]==="p"&&tag[1]===pubkey);}
function object(value:string,label:string):Record<string,unknown>{
 let parsed:unknown;try{parsed=JSON.parse(value);}catch{throw new Error(`${label} is not valid JSON.`);}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error(`${label} is not an event.`);
 return parsed as Record<string,unknown>;
}
function signedEvent(value:Record<string,unknown>,kind:number,label:string):Event{
 if(value.kind!==kind||typeof value.content!=="string"||value.content.length>MAX_CIPHERTEXT||!verifyEvent(value as unknown as Event))throw new Error(`${label} is invalid.`);
 return value as unknown as Event;
}

/** Opens one standard NIP-59 gift wrap using the connected signer's NIP-44
 * decrypt method. No private key or plaintext is sent to BitcoinWalk. */
export async function unwrapNip17Message(wrap:Event,recipientPubkey:string,decrypt:Decrypt):Promise<Nip17Message>{
 if(!HEX.test(recipientPubkey)||wrap.kind!==1059||wrap.content.length>MAX_CIPHERTEXT||!verifyEvent(wrap)||!recipient(wrap,recipientPubkey))throw new Error("Gift wrap is invalid or belongs to another account.");
 const seal=signedEvent(object(await decrypt(wrap.pubkey,wrap.content),"Decrypted seal"),13,"Decrypted seal");
 const rumor=object(await decrypt(seal.pubkey,seal.content),"Decrypted message");
 if(rumor.kind!==14||rumor.pubkey!==seal.pubkey||typeof rumor.id!=="string"||typeof rumor.content!=="string"||rumor.content.length>MAX_CONTENT||typeof rumor.created_at!=="number"||!Number.isSafeInteger(rumor.created_at)||!recipient(rumor,recipientPubkey))throw new Error("Decrypted message is invalid.");
 const unsigned={pubkey:rumor.pubkey,kind:rumor.kind,created_at:rumor.created_at,tags:rumor.tags,content:rumor.content};
 if(!HEX.test(rumor.pubkey as string)||rumor.id!==getEventHash(unsigned as Parameters<typeof getEventHash>[0]))throw new Error("Decrypted message identity is invalid.");
 return {id:rumor.id,wrapId:wrap.id,pubkey:rumor.pubkey as string,content:rumor.content,createdAt:rumor.created_at};
}

/** Reads only completed relay responses. A failed relay cannot turn an inbox
 * into a false empty state. */
export async function readNip17Wraps(pool:InboxPool,pubkey:string,relays:string[],onauth?:(event:EventTemplate)=>Promise<VerifiedEvent>):Promise<Event[]>{
 if(!HEX.test(pubkey)||!relays.length)throw new Error("No usable private-message inbox is available.");
 const results=await Promise.allSettled(relays.map(relay=>new Promise<Event[]>((resolve,reject)=>{
  const events:Event[]=[];let settled=false,subscription:{close:(reason?:string)=>void}|undefined;
  const timer=setTimeout(()=>{if(settled)return;settled=true;subscription?.close("private message read timeout");reject(new Error("Private message read timed out."));},9000);
  const finish=(reasons:{reason:string}[])=>{if(settled)return;settled=true;clearTimeout(timer);if(reasons.length===1&&reasons[0].reason==="closed automatically on eose")resolve(events);else reject(new Error("A private-message relay did not complete its read."));};
  try{subscription=pool.subscribeEose([relay],{kinds:[1059],"#p":[pubkey],limit:100},{maxWait:10000,onauth,onevent:(event:Event)=>{if(!settled)events.push(event);},onclose:finish});}catch(error){settled=true;clearTimeout(timer);reject(error);}
 })));
 const complete=results.filter((row):row is PromiseFulfilledResult<Event[]>=>row.status==="fulfilled");
 if(!complete.length)throw new Error("Private messages are temporarily unavailable: no inbox relay completed its read.");
 return [...new Map(complete.flatMap(row=>row.value).map(event=>[event.id,event])).values()].sort((a,b)=>b.created_at-a.created_at).slice(0,100);
}
