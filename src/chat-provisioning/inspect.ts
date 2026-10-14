import {SimplePool,verifyEvent,type Event} from "nostr-tools";
import type {ChatVerification} from "./store";

export type ChatInspection=ChatVerification&{name:string;picture:string|null;relayPubkey:string};
export type ExpectedChat={name:string;picture:string;members:string[]};

function exactMetadata(event:Event,groupId:string,relayPubkey:string):Omit<ChatInspection,"relayPubkey">|null{
 if(event.kind!==39000||event.pubkey!==relayPubkey||!verifyEvent(event))return null;
 const d=event.tags.filter(tag=>tag[0]==="d"&&tag.length===2);if(d.length!==1||d[0][1]!==groupId)return null;
 // Discovery and joining remain public while message history is independently
 // membership-gated by the relay. Never accept hidden/private group metadata.
 if(event.tags.some(tag=>tag[0]==="hidden"||tag[0]==="private"))return null;
 const names=event.tags.filter(tag=>tag[0]==="name"&&tag.length===2);if(names.length!==1||!names[0][1].trim()||names[0][1].length>100)return null;
 const pictures=event.tags.filter(tag=>tag[0]==="picture"&&tag.length===2);if(pictures.length>1)return null;
 const picture=pictures[0]?.[1]??null;if(picture){try{const url=new URL(picture);if(url.protocol!=="https:"||url.username||url.password)return null;}catch{return null;}}
 return {metadataEventId:event.id,publiclyReadable:true,openJoin:true,name:names[0][1].trim(),picture};
}

export async function inspectArmadaGroup(relay:string,groupId:string,options:{query?:(relay:string,groupId:string)=>Promise<Event[]>;relayIdentity?:(relay:string)=>Promise<string>;expected?:Pick<ExpectedChat,"name"|"picture">}={}):Promise<ChatInspection>{
 const url=new URL(relay);if(url.protocol!=="wss:"||url.pathname!=="/"||url.search||url.hash||url.username||url.password||url.port||!url.hostname.endsWith(".bitcoinwalk.org"))throw new Error("The paid community relay is invalid.");
 const query=options.query??(async(target,id)=>{const pool=new SimplePool();try{return await pool.querySync([target],{kinds:[39000],"#d":[id],limit:20},{maxWait:8000});}finally{pool.close([target]);pool.destroy();}});
 const relayIdentity=options.relayIdentity??(async target=>{const info=new URL(target);info.protocol="https:";const response=await fetch(info,{headers:{Accept:"application/nostr+json"},cache:"no-store",signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error();const body=await response.json() as {self?:unknown;supported_nips?:unknown};if(typeof body.self!=="string"||!/^[0-9a-f]{64}$/.test(body.self)||!Array.isArray(body.supported_nips)||!body.supported_nips.includes(29))throw new Error();return body.self;});
 let relayPubkey:string;try{relayPubkey=await relayIdentity(url.href);}catch{throw new Error("The city relay did not provide a valid NIP-29 relay identity.");}
 const events=await query(url.href,groupId),valid=events.map(event=>({event,inspection:exactMetadata(event,groupId,relayPubkey)})).filter((row):row is {event:Event;inspection:ChatInspection}=>!!row.inspection).sort((a,b)=>b.event.created_at-a.event.created_at||a.event.id.localeCompare(b.event.id));
 if(!valid.length)throw new Error("No signed public open-join NIP-29 group metadata was found on the exact city relay.");
 const inspection={...valid[0].inspection,relayPubkey};
 if(options.expected&&(inspection.name!==options.expected.name||inspection.picture!==options.expected.picture))throw new Error("The city group name or avatar does not match the current approved city.");
 return inspection;
}

export function verifyChatRoster(event:Event,groupId:string,relayPubkey:string,expectedMembers:string[]):string{
 if(event.kind!==39002||event.pubkey!==relayPubkey||!verifyEvent(event))throw new Error("The city group membership read-back is not signed by its relay.");
 const d=event.tags.filter(tag=>tag[0]==="d"&&tag.length===2);if(d.length!==1||d[0][1]!==groupId)throw new Error("The city group membership read-back targets another group.");
 const members=new Set(event.tags.filter(tag=>tag[0]==="p"&&tag.length>=2&&/^[0-9a-f]{64}$/.test(tag[1])).map(tag=>tag[1]));
 for(const key of [...new Set(expectedMembers)])if(!members.has(key))throw new Error("The city group is missing one or more required founding members.");
 return event.id;
}
