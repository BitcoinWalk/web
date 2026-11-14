import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CHAT_PROTECTION_MS,CHAT_STORAGE_BYTES,MAX_CHAT_RECORDS,reserveChatStorage} from "./chat-media-retention";
import type {MediaRecord} from "./media-store";

const now=Date.parse("2026-11-13T12:00:00Z"),day=86400_000;
const hash=(n:number)=>n.toString(16).padStart(64,"0");
const incoming={hash:hash(99),bytes:3};
let directory:string;
const record=(n:number,age:number,sourceUrl="chat-upload:group"):MediaRecord=>({id:String(n),cityId:"chat:group",actor:"a",sourceUrl,contentHash:hash(n),bytes:1,storedAt:new Date(now-age*day).toISOString(),checkedAt:new Date(now).toISOString(),status:"healthy"});
beforeEach(async()=>{directory=await mkdtemp(join(process.env.TEST_ARTIFACT_DIR||tmpdir(),"chat-retention-"));});
afterEach(async()=>{await rm(directory,{recursive:true,force:true});});
const file=async(n:number,size:number)=>writeFile(join(directory,hash(n)+".webp"),Buffer.alloc(size,n));
const exists=async(n:number)=>readFile(join(directory,hash(n)+".webp"));
const limits={bytes:10,records:100};

describe("chat image capacity and retention",()=>{
 it("uses 2 decimal GB and 90 days",()=>{expect(CHAT_STORAGE_BYTES).toBe(2_000_000_000);expect(CHAT_PROTECTION_MS).toBe(90*day);expect(MAX_CHAT_RECORDS).toBe(100_000);});
 it("keeps old images below capacity and admits exactly at capacity",async()=>{await file(1,7);expect(await reserveChatStorage([record(1,100)],directory,incoming,now,limits)).toHaveLength(1);expect((await exists(1)).length).toBe(7);});
 it("counts actual bytes and evicts the oldest eligible hash first",async()=>{await file(1,5);await file(2,5);const result=await reserveChatStorage([record(2,100),record(1,120)],directory,incoming,now,limits);expect(result.map(r=>r.contentHash)).toEqual([hash(2)]);await expect(exists(1)).rejects.toMatchObject({code:"ENOENT"});expect((await exists(2)).length).toBe(5);});
 it("protects the exact 90-day boundary and younger images",async()=>{for(const age of [0,89,90]){await file(1,10);await expect(reserveChatStorage([record(1,age)],directory,incoming,now,limits)).rejects.toThrow("protected for 90 days");expect((await exists(1)).length).toBe(10);}});
 it("does not partially delete when there is not enough eligible space",async()=>{await file(1,2);await file(2,10);await expect(reserveChatStorage([record(1,100),record(2,1)],directory,incoming,now,limits)).rejects.toThrow("full");expect((await exists(1)).length).toBe(2);});
 it("counts duplicate hashes once and protects the latest share",async()=>{await file(1,7);const refs=[record(1,120),record(1,1)];expect(await reserveChatStorage(refs,directory,incoming,now,limits)).toHaveLength(2);await expect(reserveChatStorage(refs,directory,{...incoming,bytes:4},now,limits)).rejects.toThrow("full");expect((await exists(1)).length).toBe(7);});
 it("does not delete a shared walk image, but does count its chat use",async()=>{await file(1,10);await expect(reserveChatStorage([record(1,120),record(1,120,"walk-upload:city")],directory,incoming,now,limits)).rejects.toThrow("full");expect((await exists(1)).length).toBe(10);});
 it("does not charge unrelated walk files to the chat budget",async()=>{await file(1,20);expect(await reserveChatStorage([record(1,120,"walk-upload:city")],directory,incoming,now,limits)).toHaveLength(1);expect((await exists(1)).length).toBe(20);});
 it("charges an existing nonchat image when it is first shared in chat",async()=>{await file(99,20);await expect(reserveChatStorage([record(99,120,"walk-upload:city")],directory,incoming,now,limits)).rejects.toThrow("full");});
 it("charges orphan files conservatively without deleting them",async()=>{await file(1,10);await expect(reserveChatStorage([],directory,incoming,now,limits)).rejects.toThrow("full");expect((await exists(1)).length).toBe(10);});
 it("an identical upload needs no extra file space and is never evicted",async()=>{await file(99,10);expect(await reserveChatStorage([record(99,120)],directory,incoming,now,limits)).toHaveLength(1);expect((await exists(99)).length).toBe(10);});
 it("prunes expired failed attempts but preserves the rolling-hour quota",async()=>{const old={...record(1,1),contentHash:undefined,status:"failed" as const},recent={...old,id:"2",storedAt:new Date(now-1000).toISOString()};expect(await reserveChatStorage([old,recent],directory,incoming,now,limits)).toEqual([recent]);});
 it("does not delete images merely to satisfy the metadata bound",async()=>{await file(1,1);await file(2,1);const refs=[record(1,120),record(1,110),record(2,100)];await expect(reserveChatStorage(refs,directory,incoming,now,{bytes:10,records:3})).rejects.toThrow("record limit");expect((await exists(1)).length).toBe(1);expect((await exists(2)).length).toBe(1);});
 it("removes all expired references when byte capacity requires eviction",async()=>{await file(1,5);await file(2,5);const refs=[record(1,120),record(1,110),record(2,100)];expect(await reserveChatStorage(refs,directory,incoming,now,{bytes:10,records:3})).toEqual([record(2,100)]);await expect(exists(1)).rejects.toMatchObject({code:"ENOENT"});});
});
