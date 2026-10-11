import {decode} from "bolt11";
import {nip57,verifyEvent,type Event} from "nostr-tools";

const hex=/^[0-9a-f]{64}$/;
export type ZapPayMetadata={callback:string;minSendable:number;maxSendable:number;nostrPubkey:string};

function one(tags:string[][],name:string){const rows=tags.filter(tag=>tag[0]===name);return rows.length===1&&rows[0].length===2?rows[0][1]:null;}
function bytes(value:string){if(!/^[0-9a-f]+$/.test(value)||value.length%2)return null;const out=new Uint8Array(value.length/2);for(let i=0;i<out.length;i++)out[i]=Number.parseInt(value.slice(i*2,i*2+2),16);return out;}
async function sha256(value:Uint8Array){const copy=new Uint8Array(value.byteLength);copy.set(value);const digest=await crypto.subtle.digest("SHA-256",copy.buffer);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}

export function lightningAddress(href:string){
 const value=href.startsWith("lightning:")?href.slice(10):"",match=/^([a-z0-9][a-z0-9._-]*)@([a-z0-9.-]+)$/i.exec(value);
 if(!match||match[2].toLowerCase()!=="bitcoinwalk.org")throw new Error("This city Lightning address is unavailable.");
 return {address:value.toLowerCase(),metadata:`https://bitcoinwalk.org/.well-known/lnurlp/${encodeURIComponent(match[1].toLowerCase())}`};
}

export function parseZapPayMetadata(input:unknown):ZapPayMetadata{
 if(!input||typeof input!=="object")throw new Error("The city Lightning address returned an invalid response.");
 const row=input as Record<string,unknown>,callback=typeof row.callback==="string"?row.callback:"",nostrPubkey=typeof row.nostrPubkey==="string"?row.nostrPubkey:"",minSendable=Number(row.minSendable),maxSendable=Number(row.maxSendable);
 let url:URL;try{url=new URL(callback);}catch{throw new Error("The city Lightning callback is invalid.");}
 if(row.tag!=="payRequest"||row.allowsNostr!==true||!hex.test(nostrPubkey)||url.protocol!=="https:"||url.hostname!=="bitcoinwalk.org"||url.username||url.password||!Number.isSafeInteger(minSendable)||!Number.isSafeInteger(maxSendable)||minSendable<1||maxSendable<minSendable)throw new Error("Verified Nostr zaps are not enabled for this address.");
 return {callback:url.href,minSendable,maxSendable,nostrPubkey};
}

export async function verifyPublicZapReceipt(event:Event,request:Event,providerPubkey:string,recipientPubkey:string,amountMsat:number){
 if(event.kind!==9735||event.pubkey!==providerPubkey||!verifyEvent(structuredClone(event))||!hex.test(providerPubkey))return false;
 const p=one(event.tags,"p"),payer=one(event.tags,"P"),bolt=one(event.tags,"bolt11"),description=one(event.tags,"description"),preimage=one(event.tags,"preimage"),document=JSON.stringify(request);
 if(p!==recipientPubkey||payer!==request.pubkey||description!==document||!bolt||!preimage)return false;
 try{
  if(nip57.validateZapRequest(document)!==null)return false;
  const expected:string[][]=[["p",recipientPubkey],["P",request.pubkey]];
  for(const name of ["e","a","k"]){const tag=request.tags.filter(row=>row[0]===name);if(tag.length>1)return false;if(tag[0])expected.push([name,tag[0][1]]);}
  expected.push(["bolt11",bolt],["description",document],["preimage",preimage]);
  if(JSON.stringify(event.tags)!==JSON.stringify(expected))return false;
  const invoice=decode(bolt),raw=bytes(preimage);
  if(!raw)return false;
  return invoice.millisatoshis===String(amountMsat)&&invoice.tagsObject.purpose_commit_hash===await sha256(new TextEncoder().encode(document))&&invoice.tagsObject.payment_hash===await sha256(raw);
 }catch{return false;}
}
