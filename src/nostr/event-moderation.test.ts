import {afterEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,getPublicKey} from "nostr-tools";
const key=new Uint8Array(32).fill(7);
vi.mock("./authority",()=>({isSuperAdmin:(pubkey:string)=>pubkey===getPublicKey(new Uint8Array(32).fill(7)),SUPER_ADMIN_PUBKEY:getPublicKey(new Uint8Array(32).fill(7))}));
import {createEventModeration,parseEventModeration,latestEventModerations,walkAddress,requireEventModerationRelay,type EventModeration} from "./event-moderation";
const cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f";
const input:EventModeration={cityId,scope:"event",target:`31923:${getPublicKey(key)}:${cityId}:2026-10-10`,eventId:"a".repeat(64),status:"hidden",reason:"Test hide"};
afterEach(()=>vi.unstubAllGlobals());
describe("signed event moderation",()=>{
 it("round-trips a signed exact-address decision and retains a later unhide",()=>{
  const hidden=finalizeEvent({...createEventModeration(input),created_at:10},key),parsed=parseEventModeration(hidden)!;
  expect(parsed.decision).toEqual(input);
  const unhide=finalizeEvent({...createEventModeration({...input,status:"visible",previous:hidden.id}),created_at:11},key);
  expect(latestEventModerations([parsed,parseEventModeration(unhide)!,parsed]).map(r=>r.decision.status)).toEqual(["visible"]);
  expect(parseEventModeration({...unhide,content:"tampered"})).toBeNull();
  expect(parseEventModeration(finalizeEvent(createEventModeration(input),new Uint8Array(32).fill(8)))).toBeNull();
 });
 it("rejects malformed targets/statuses and empty reasons",()=>{
  for(const patch of [{scope:"city"},{status:"active"},{eventId:undefined},{target:"31923:bad:foo"},{reason:" "},{previous:"wrong"}])expect(()=>createEventModeration({...input,...patch} as EventModeration)).toThrow();
  expect(()=>createEventModeration({cityId,scope:"city",target:cityId,status:"suspended",reason:"Pause"})).not.toThrow();
  expect(()=>createEventModeration({cityId,scope:"author",target:getPublicKey(key),status:"active",reason:"Resume"})).not.toThrow();
 });
 it("binds the signed tags and distinguishes city and author scopes",()=>{
  const template=createEventModeration(input);template.tags[1]=["i","00000000-0000-4000-8000-000000000001"];
  expect(parseEventModeration(finalizeEvent(template,key))).toBeNull();
  const records=["city","author"].map(scope=>parseEventModeration(finalizeEvent(createEventModeration({cityId,scope:scope as "city"|"author",target:scope==="city"?cityId:getPublicKey(key),status:"suspended",reason:"Pause"}),key))!);
  expect(latestEventModerations(records)).toHaveLength(2);
 });
 it("computes a stable address across different signed editions",()=>{
  const a=finalizeEvent({kind:31923,created_at:1,content:"First",tags:[["d",cityId+":2026-10-10"]]},key),b=finalizeEvent({...a,created_at:2,content:"Edited"},key);
  expect(a.id).not.toBe(b.id);expect(walkAddress(a)).toBe(walkAddress(b));
 });
 it("requires capability on every write relay",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({version:"bitcoinwalk-organizers-0.8.55"})}));
  await expect(requireEventModerationRelay(["wss://relay.example"])).rejects.toThrow("0.8.56");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({version:"bitcoinwalk-organizers-0.8.56"})}));
  await expect(requireEventModerationRelay(["wss://relay.example"])).resolves.toBeUndefined();
 });
});
