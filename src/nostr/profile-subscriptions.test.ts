import {afterEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey} from "nostr-tools";
const mocks=vi.hoisted(()=>({subscribe:vi.fn(),close:vi.fn(),destroy:vi.fn()}));
vi.mock("nostr-tools",async importOriginal=>({...await importOriginal<typeof import("nostr-tools")>(),SimplePool:class {subscribeEose=mocks.subscribe;close=mocks.close;destroy=mocks.destroy;}}));
import {watchPublicProfiles,retryPublicProfile} from "./profiles";
const cleanups:Array<()=>void>=[];
afterEach(()=>{for(const stop of cleanups.splice(0))stop();vi.useRealTimers();vi.clearAllMocks();});
const event=()=>finalizeEvent({kind:0,created_at:Math.floor(Date.now()/1000),tags:[],content:JSON.stringify({name:"endo",nip05:"endo@bitcoinwalk.org",lud16:"endo@bitcoinwalk.org"})},generateSecretKey());
describe("shared profile subscriptions",()=>{
 it("shares one request, survives one consumer leaving and delivers cached results",async()=>{
  const profile=event(),first=vi.fn(),second=vi.fn(),third=vi.fn();
  const stop=watchPublicProfiles([profile.pubkey],first);cleanups.push(stop);
  cleanups.push(watchPublicProfiles([profile.pubkey],second));
  await Promise.resolve();expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  stop();expect(mocks.destroy).not.toHaveBeenCalled();
  mocks.subscribe.mock.calls[0][2].onevent(profile);
  expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledWith(profile.pubkey,expect.objectContaining({name:"endo"}));
  cleanups.push(watchPublicProfiles([profile.pubkey],third));await Promise.resolve();
  expect(third).toHaveBeenCalledWith(profile.pubkey,expect.objectContaining({lnurl:"endo@bitcoinwalk.org"}));
  expect(mocks.subscribe).toHaveBeenCalledTimes(1);
 });
 it("retries a missing profile once, reports unavailable, and permits manual recovery",async()=>{
  vi.useFakeTimers();const profile=event(),update=vi.fn(),status=vi.fn();
  cleanups.push(watchPublicProfiles([profile.pubkey],update,status));
  await vi.advanceTimersByTimeAsync(14000);
  expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  expect(status).toHaveBeenLastCalledWith(profile.pubkey,"unavailable");
  retryPublicProfile(profile.pubkey);expect(mocks.subscribe).toHaveBeenCalledTimes(3);
  mocks.subscribe.mock.calls[2][2].onevent(profile);
  expect(status).toHaveBeenLastCalledWith(profile.pubkey,"ready");
  expect(update).toHaveBeenCalledWith(profile.pubkey,expect.objectContaining({name:"endo"}));
 });
 it("ignores events from a disposed account subscription",async()=>{
  const profile=event(),update=vi.fn();const stop=watchPublicProfiles([profile.pubkey],update);cleanups.push(stop);
  await Promise.resolve();const callback=mocks.subscribe.mock.calls[0][2].onevent;stop();callback(profile);
  expect(update).not.toHaveBeenCalled();
 });
});
