import {describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey,type Event,type EventTemplate,type VerifiedEvent} from "nostr-tools";
import {publishIdempotent,readAnyComplete} from "./transport";

const event={id:"a".repeat(64)} as Event;
const auth=async(template:EventTemplate)=>template as VerifiedEvent;
describe("Guide idempotent publication",()=>{
 it("accepts a relay-confirmed duplicate of the exact persisted event",async()=>{const pool={publish:vi.fn(()=>[Promise.reject(new Error("duplicate: already have this event")),Promise.reject(new Error("blocked: test"))])};await expect(publishIdempotent(pool as never,["wss://one.example/","wss://two.example/"],event,auth)).resolves.toBe("duplicate");});
 it("uses fixed failure categories without returning relay text",async()=>{const pool={publish:vi.fn(()=>[Promise.reject(new Error("rate-limited: arbitrary relay text")),Promise.reject(new Error("publish timed out"))])};await expect(publishIdempotent(pool as never,["wss://one.example/","wss://two.example/"],event,auth)).rejects.toThrow("rate-limit");});
 it("accepts one normal acknowledgement",async()=>{const pool={publish:vi.fn(()=>[Promise.reject(new Error("blocked: test")),Promise.resolve("saved")])};await expect(publishIdempotent(pool as never,["wss://one.example/","wss://two.example/"],event,auth)).resolves.toBe("acknowledged");});
});
describe("Guide inbox discovery availability",()=>{
 it("merges valid results when one reviewed discovery relay completes",async()=>{const inbox=finalizeEvent({kind:10050,created_at:1,content:"",tags:[["relay","wss://one.example/"]]},generateSecretKey());const pool={subscribeEose:(relays:string[],_filter:unknown,handlers:{onevent:(event:Event)=>void;onclose:(reasons:Array<{url:string;reason:string}>)=>void})=>{queueMicrotask(()=>{if(relays[0].includes("one")){handlers.onevent(inbox);handlers.onclose([{url:relays[0],reason:"closed automatically on eose"}]);}else handlers.onclose([{url:relays[0],reason:"connection failed"}]);});return {close:vi.fn()};}};await expect(readAnyComplete(pool as never,["wss://one.example/","wss://two.example/"],{kinds:[10050]})).resolves.toEqual([inbox]);});
 it("fails closed when no discovery relay completes",async()=>{const pool={subscribeEose:(relays:string[],_filter:unknown,handlers:{onclose:(reasons:Array<{url:string;reason:string}>)=>void})=>{queueMicrotask(()=>handlers.onclose([{url:relays[0],reason:"connection failed"}]));return {close:vi.fn()};}};await expect(readAnyComplete(pool as never,["wss://one.example/","wss://two.example/"],{kinds:[10050]})).rejects.toThrow("No discovery relay");});
});
