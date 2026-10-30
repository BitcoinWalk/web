import {describe,expect,it,vi} from "vitest";
import {NIP46_PAIRING_RELAYS,readBunkerPublicKey,recoverNip46Handoff,replayableNip46Filter} from "./nip46-pairing";

describe("NIP-46 pairing recovery",()=>{
 it("uses the dedicated BitcoinWalk remote-signer transport",()=>{
  expect(NIP46_PAIRING_RELAYS).toEqual(["wss://remote.bitcoinwalk.org/"]);
 });

 it("allows the memory-only relay to replay a missed handoff",()=>{
  expect(replayableNip46Filter({kinds:[24133],"#p":["a".repeat(64)],limit:0})).toEqual({kinds:[24133],"#p":["a".repeat(64)]});
  expect(replayableNip46Filter({kinds:[24133],limit:1})).toEqual({kinds:[24133],limit:1});
 });

 it("retries only the account read when Amber is not ready immediately",async()=>{
  vi.useFakeTimers();
  const getPublicKey=vi.fn<()=>Promise<string>>()
   .mockImplementationOnce(()=>new Promise(()=>{}))
   .mockImplementationOnce(()=>new Promise(()=>{}))
   .mockResolvedValue("b".repeat(64));
  try{
   const pending=readBunkerPublicKey({getPublicKey},{timeoutMs:60_000});
   await vi.advanceTimersByTimeAsync(30_001);
   await expect(pending).resolves.toBe("b".repeat(64));
   expect(getPublicKey).toHaveBeenCalledTimes(3);
  }finally{vi.useRealTimers();}
 });

 it("ends a stalled account read with an actionable error",async()=>{
  vi.useFakeTimers();
  const getPublicKey=vi.fn(()=>new Promise<string>(()=>{}));
  try{
   const pending=readBunkerPublicKey({getPublicKey},{timeoutMs:100,retryDelays:[0]});
   const assertion=expect(pending).rejects.toThrow("did not receive the account response in time");
   await vi.advanceTimersByTimeAsync(101);
   await assertion;
  }finally{vi.useRealTimers();}
 });

 it("re-subscribes after a mobile background close without changing the handoff",async()=>{
  vi.useFakeTimers();
  const connect=vi.fn<()=>Promise<string>>()
   .mockRejectedValueOnce(new Error("subscription closed before connection was established."))
   .mockRejectedValueOnce(new Error("subscription closed before connection was established."))
   .mockResolvedValue("connected"),onRetry=vi.fn();
  try{
   const pending=recoverNip46Handoff(connect,{retryDelayMs:100,onRetry});
   await vi.advanceTimersByTimeAsync(201);
   await expect(pending).resolves.toBe("connected");
   expect(connect).toHaveBeenCalledTimes(3);
   expect(onRetry).toHaveBeenNthCalledWith(1,1);
   expect(onRetry).toHaveBeenNthCalledWith(2,2);
  }finally{vi.useRealTimers();}
 });

 it("does not retry a non-background handoff failure",async()=>{
  const connect=vi.fn<()=>Promise<string>>().mockRejectedValue(new Error("invalid handoff"));
  await expect(recoverNip46Handoff(connect)).rejects.toThrow("invalid handoff");
  expect(connect).toHaveBeenCalledTimes(1);
 });
});
