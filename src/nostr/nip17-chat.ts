import {getEventHash,verifyEvent,type Event} from "nostr-tools";
import type {Nip29Message} from "./nip29-chat";

const hex=/^[0-9a-f]{64}$/;
type Decrypt=(pubkey:string,ciphertext:string)=>Promise<string>;

function parsedEvent(value:string):Event|null{
 try{
  const event=JSON.parse(value) as Event;
  return event&&typeof event==="object"&&Array.isArray(event.tags)&&typeof event.content==="string"?event:null;
 }catch{return null;}
}

/** Opens one NIP-17 gift wrap and accepts only a validated Guide-to-recipient rumor. */
export async function openGuideGiftWrap(wrap:Event,recipient:string,guide:string,decrypt:Decrypt,now=Math.floor(Date.now()/1000)):Promise<Nip29Message|null>{
 if(!hex.test(recipient)||!hex.test(guide)||wrap.kind!==1059||!verifyEvent(wrap)||wrap.created_at>now+60||!wrap.tags.some(tag=>tag[0]==="p"&&tag[1]===recipient))return null;
 try{
  const seal=parsedEvent(await decrypt(wrap.pubkey,wrap.content));
  if(!seal||seal.kind!==13||seal.pubkey!==guide||!verifyEvent(seal)||seal.created_at>now+60)return null;
  const rumor=parsedEvent(await decrypt(seal.pubkey,seal.content));
  if(!rumor||rumor.kind!==14||rumor.pubkey!==guide||rumor.created_at>now+60||rumor.id!==getEventHash(rumor)||!rumor.tags.some(tag=>tag[0]==="p"&&tag[1]===recipient))return null;
  const content=rumor.content.trim();if(!content||content.length>4000)return null;
  return {id:rumor.id,pubkey:guide,content,createdAt:rumor.created_at};
 }catch{return null;}
}

export async function guideMessages(wraps:Event[],recipient:string,guide:string,decrypt:Decrypt):Promise<Nip29Message[]>{
 const opened=await Promise.all(wraps.map(wrap=>openGuideGiftWrap(wrap,recipient,guide,decrypt))),rows=new Map<string,Nip29Message>();
 for(const row of opened)if(row)rows.set(row.id,row);
 return [...rows.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).slice(-200);
}
