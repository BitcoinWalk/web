import {describe,it,expect,vi} from "vitest";
import type {Event} from "nostr-tools";
import type {Nip17Message} from "./nip17-inbox";
import {openGuideHistory} from "./guide-history";

const wrap=(id:string)=>({id} as Event);
const message=(id:string,createdAt=1):Nip17Message=>({id,wrapId:id,pubkey:"guide",recipient:"actor",content:"private",createdAt});
describe("progressive Guide history",()=>{
 it("shows opened messages before the slow relay completes, and deduplicates",async()=>{
  let finish!:(events:Event[])=>void;
  const onMessages=vi.fn(),open=vi.fn(async(event:Event)=>message(event.id));
  const task=openGuideHistory({actor:"actor",guide:"guide",cache:new Map(),active:()=>true,open,onMessages,read:async batch=>{batch([wrap("one")]);return new Promise(resolve=>{finish=resolve;});}});
  await vi.waitFor(()=>expect(onMessages).toHaveBeenCalledWith([message("one")]));
  finish([wrap("one"),wrap("two")]);
  expect(await task).toEqual({count:2,unreadable:0});expect(open).toHaveBeenCalledTimes(2);
 });
 it("reuses verified messages on refresh, sorts actual message dates, and excludes other chats",async()=>{
  const cache=new Map(),onMessages=vi.fn(),open=vi.fn(async(event:Event)=>event.id==="other"?{...message("other"),pubkey:"someone-else"}:message(event.id,event.id==="new"?20:10));
  const options={actor:"actor",guide:"guide",cache,active:()=>true,open,onMessages,read:async()=>[wrap("new"),wrap("old"),wrap("other")]};
  await openGuideHistory(options);expect(onMessages).toHaveBeenLastCalledWith([message("old",10),message("new",20)]);
  expect(cache.has("other")).toBe(false);await openGuideHistory(options);expect(open).toHaveBeenCalledTimes(4);
 });
 it("does not update the cache or UI after account cancellation",async()=>{
  let active=true;const cache=new Map(),onMessages=vi.fn();
  await openGuideHistory({actor:"actor",guide:"guide",cache,active:()=>active,onMessages,read:async()=>[wrap("one")],open:async()=>{active=false;return message("one");}});
  expect(cache.size).toBe(0);expect(onMessages).not.toHaveBeenCalled();
 });
 it("skips unreadable messages without hiding valid ones",async()=>{
  const onMessages=vi.fn();expect(await openGuideHistory({actor:"actor",guide:"guide",cache:new Map(),active:()=>true,onMessages,read:async()=>[wrap("bad"),wrap("good")],open:async event=>{if(event.id==="bad")throw new Error("invalid seal");return message("good");}})).toEqual({count:1,unreadable:1});
 });
});
