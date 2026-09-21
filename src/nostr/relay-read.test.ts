import {describe,it,expect,vi,afterEach} from "vitest";
import {queryAuthorizations} from "./city-records";
const state=vi.hoisted(()=>({mode:"failure",pools:0}));
vi.mock("nostr-tools",async original=>{
  const actual=await original<typeof import("nostr-tools")>();
  return {...actual,SimplePool:class {
    constructor(){state.pools++;}
    subscribeEose(_urls:unknown,_filter:unknown,callbacks:{onclose:(r:{url:string;reason:string}[])=>void}) {
      if(state.mode!=="timeout") queueMicrotask(()=>callbacks.onclose([{url:"wss://test.invalid",reason:state.mode==="failure"?"connection failed":"closed automatically on eose"}]));
      return {close:()=>{}};
    }
    destroy(){}
  }};
});
afterEach(()=>vi.useRealTimers());
describe("relay read outcomes",()=>{
 it("does not turn failed connections into zero cities",async()=>{
  state.mode="failure";
  await expect(queryAuthorizations(["wss://test.invalid"])).rejects.toThrow("connection failed");
 });
 it("allows a genuinely completed empty read and shares connections",async()=>{
  state.mode="success";
  const before=state.pools;
  expect(await Promise.all([queryAuthorizations(["wss://test.invalid"]),queryAuthorizations(["wss://test.invalid"])])).toEqual([[],[]]);
  expect(state.pools-before).toBeLessThanOrEqual(1);
 });
 it("rejects missing configuration",async()=>{
  await expect(queryAuthorizations([])).rejects.toThrow("No read relay");
 });
 it("rejects a timeout rather than accepting synthetic end-of-results",async()=>{
  vi.useFakeTimers();state.mode="timeout";
  const assertion=expect(queryAuthorizations(["wss://test.invalid"])).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10_000);await assertion;
 });
});
