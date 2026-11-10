import {getEventHash,verifyEvent,type Event,type EventTemplate,type SimplePool,type VerifiedEvent} from "nostr-tools";

export type Nip17Message={id:string;wrapId:string;pubkey:string;recipient:string;content:string;createdAt:number;kind?:14|7|5;target?:string;expiresAt?:number};
type Decrypt=(pubkey:string,ciphertext:string)=>Promise<string>;
type InboxPool=Pick<SimplePool,"subscribeEose"> & Partial<Pick<SimplePool,"ensureRelay">>;

const HEX=/^[a-f0-9]{64}$/;
const MAX_CIPHERTEXT=128*1024;
const MAX_CONTENT=16*1024;

export const nip17OpenStages={
 "gift-wrap-validation":"The encrypted envelope failed validation before contacting the signer.",
 "gift-wrap-decryption":"The signer could not decrypt the outer envelope.",
 "seal-validation":"The decrypted seal failed validation.",
 "message-decryption":"The signer could not decrypt the inner message.",
 "message-validation":"The decrypted message failed validation.",
} as const;
export class Nip17OpenError extends Error{
 constructor(readonly stage:keyof typeof nip17OpenStages){super(stage==="gift-wrap-validation"?"Gift wrap is invalid or belongs to another account.":nip17OpenStages[stage]);}
}

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
 let stage:keyof typeof nip17OpenStages="gift-wrap-validation";
 try{
 if(!HEX.test(recipientPubkey)||wrap.kind!==1059||wrap.content.length>MAX_CIPHERTEXT||!verifyEvent(wrap)||!recipient(wrap,recipientPubkey))throw new Error("Gift wrap is invalid or belongs to another account.");
 stage="gift-wrap-decryption";
 const plaintext=await decrypt(wrap.pubkey,wrap.content);
 stage="seal-validation";
 const seal=signedEvent(object(plaintext,"Decrypted seal"),13,"Decrypted seal");
 stage="message-decryption";
 const content=await decrypt(seal.pubkey,seal.content);
 stage="message-validation";
 const rumor=object(content,"Decrypted message");
 const targets=Array.isArray(rumor.tags)?rumor.tags.filter(tag=>Array.isArray(tag)&&tag[0]==="p"&&HEX.test(String(tag[1]))).map(tag=>String(tag[1])):[];
 if(![14,7,5].includes(rumor.kind as number)||rumor.pubkey!==seal.pubkey||typeof rumor.id!=="string"||typeof rumor.content!=="string"||rumor.content.length>MAX_CONTENT||typeof rumor.created_at!=="number"||!Number.isSafeInteger(rumor.created_at)||targets.length!==1||(targets[0]!==recipientPubkey&&rumor.pubkey!==recipientPubkey))throw new Error("Decrypted message is invalid.");
 const unsigned={pubkey:rumor.pubkey,kind:rumor.kind,created_at:rumor.created_at,tags:rumor.tags,content:rumor.content};
 if(!HEX.test(rumor.pubkey as string)||rumor.id!==getEventHash(unsigned as Parameters<typeof getEventHash>[0]))throw new Error("Decrypted message identity is invalid.");
 const tags=rumor.tags as string[][],references=tags.filter(tag=>tag[0]==="e"),expirations=tags.filter(tag=>tag[0]==="expiration"),target=references.length===1&&HEX.test(references[0][1])?references[0][1]:undefined;
 if(rumor.kind!==14&&(!target||!tags.some(tag=>tag[0]==="k"&&tag[1]===(rumor.kind===7?"14":"7"))))throw new Error("Invalid private reaction target.");
 const expiresAt=expirations.length===1?Number(expirations[0][1]):undefined;
 if(rumor.kind===7&&(rumor.content!=="👀"||typeof expiresAt!=="number"||!Number.isSafeInteger(expiresAt)||expiresAt<=rumor.created_at||expiresAt>rumor.created_at+300))throw new Error("Invalid processing reaction.");
 return {id:rumor.id,wrapId:wrap.id,pubkey:rumor.pubkey as string,recipient:targets[0],content:rumor.content,createdAt:rumor.created_at,...(rumor.kind!==14?{kind:rumor.kind as 7|5,target,expiresAt}:target?{target}:{})};
 }catch{throw new Nip17OpenError(stage);}
}

/** Reads only completed relay responses. A failed relay cannot turn an inbox
 * into a false empty state. */
export async function readNip17Wraps(pool:InboxPool,pubkey:string,relays:string[],onauth?:(event:EventTemplate)=>Promise<VerifiedEvent>,onBatch?:(events:Event[])=>void):Promise<Event[]>{
 if(!HEX.test(pubkey)||!relays.length)throw new Error("No usable private-message inbox is available.");
 const results=await Promise.allSettled(relays.map(relay=>new Promise<Event[]>((resolve,reject)=>{
  const events:Event[]=[];let settled=false,authRetried=false,subscription:{close:(reason?:string)=>void}|undefined;
  const timer=setTimeout(()=>{if(settled)return;settled=true;subscription?.close("private message read timeout");reject(new Error("Private message read timed out."));},9000);
  const finish=(reasons:{reason:string}[])=>{
   if(settled)return;
   // Damus prefixes its authentication refusal; nostr-tools only retries the unprefixed form.
   if(!authRetried&&onauth&&pool.ensureRelay&&reasons.length===1&&reasons[0].reason.startsWith("ERROR: auth-required:")){
    authRetried=true;
    void pool.ensureRelay(relay).then(connection=>{if(settled)throw new Error("Inbox read expired.");return connection.auth(onauth);}).then(()=>{if(!settled){events.length=0;subscribe();}}).catch(()=>finish([{reason:"Relay authentication failed."}]));
    return;
   }
   settled=true;clearTimeout(timer);if(reasons.length===1&&reasons[0].reason==="closed automatically on eose"){onBatch?.([...events].sort((a,b)=>b.created_at-a.created_at).slice(0,100));resolve(events);}else reject(new Error("A private-message relay did not complete its read."));
  };
  const subscribe=()=>{try{subscription=pool.subscribeEose([relay],{kinds:[1059],"#p":[pubkey],limit:100},{maxWait:10000,onauth,onevent:(event:Event)=>{if(!settled)events.push(event);},onclose:finish});}catch(error){settled=true;clearTimeout(timer);reject(error);}};
  subscribe();
 })));
 const complete=results.filter((row):row is PromiseFulfilledResult<Event[]>=>row.status==="fulfilled");
 if(!complete.length)throw new Error("Private messages are temporarily unavailable: no inbox relay completed its read.");
 return [...new Map(complete.flatMap(row=>row.value).map(event=>[event.id,event])).values()].sort((a,b)=>b.created_at-a.created_at).slice(0,100);
}
