import {lstat,readdir,unlink} from "node:fs/promises";
import {join} from "node:path";
import type {MediaRecord} from "./media-store";

export const CHAT_STORAGE_BYTES=2_000_000_000;
export const CHAT_PROTECTION_MS=90*24*60*60*1000;
export const MAX_CHAT_RECORDS=100_000;
export const isChatRecord=(record:MediaRecord)=>record.sourceUrl.startsWith("chat-upload:");

/** Called under the media-store lock, before writing the incoming file. */
export async function reserveChatStorage(
 records:MediaRecord[],directory:string,incoming:{hash:string;bytes:number},now:number,
 limits={bytes:CHAT_STORAGE_BYTES,records:MAX_CHAT_RECORDS},
):Promise<MediaRecord[]>{
 if(!/^[a-f0-9]{64}$/.test(incoming.hash)||!Number.isSafeInteger(incoming.bytes)||incoming.bytes<0)throw new Error("Invalid chat image storage reservation.");
 const retained=records.filter(record=>!isChatRecord(record)||record.contentHash||Date.parse(record.storedAt)>now-3600_000);
 const references=new Map<string,MediaRecord[]>();
 for(const record of retained){if(record.contentHash){const refs=references.get(record.contentHash)??[];refs.push(record);references.set(record.contentHash,refs);}}
 let names:string[];
 try{names=await readdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;names=[];}
 const sizes=new Map<string,number>();
 for(const name of names){
  if(!/^[a-f0-9]{64}\.webp$/.test(name))continue;
  const info=await lstat(join(directory,name));
  if(!info.isFile())throw new Error("Media storage contains an unexpected file type; review required.");
  sizes.set(name.slice(0,-5),info.size);
 }
 let used=0;
 for(const [hash,size] of sizes){const refs=references.get(hash);if(!refs||refs.some(isChatRecord)||hash===incoming.hash)used+=size;}
 if(!sizes.has(incoming.hash))used+=incoming.bytes;
 let count=retained.filter(isChatRecord).length+1;
 const candidates=[...references].filter(([hash,refs])=>hash!==incoming.hash&&refs.every(record=>isChatRecord(record)&&Date.parse(record.storedAt)<now-CHAT_PROTECTION_MS))
  .map(([hash,refs])=>({hash,refs,latest:refs.reduce((latest,record)=>Math.max(latest,Date.parse(record.storedAt)),0)}))
  .sort((a,b)=>a.latest-b.latest||a.hash.localeCompare(b.hash));
 const removed=new Set<string>();
 for(const candidate of candidates){
  if(used<=limits.bytes)break;
  removed.add(candidate.hash);used-=sizes.get(candidate.hash)??0;count-=candidate.refs.length;
 }
 if(used>limits.bytes)throw new Error("Chat image storage is full. Images are protected for 90 days; please try again later.");
 if(count>limits.records)throw new Error("Chat image record limit reached. Storage maintenance is required before new uploads.");
 // Never partially evict images when there is insufficient eligible space.
 for(const hash of removed){if(sizes.has(hash))await unlink(join(directory,hash+".webp"));}
 return retained.filter(record=>!record.contentHash||!removed.has(record.contentHash));
}
