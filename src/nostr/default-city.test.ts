import {describe,it,expect} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {parseDefaultCity,latestDefaultCity,DEFAULT_CITY_TAG} from "./default-city";
describe("private account default city",()=>{
 it("accepts only versioned city IDs, never URLs or room permissions",()=>{
  const cityId="d7d1cda8-7a58-42ad-ab60-c4bad61dab9a";
  expect(parseDefaultCity(JSON.stringify({version:1,cityId}))).toBe(cityId);
  for(const value of ['null','{}',JSON.stringify({version:2,cityId}),JSON.stringify({version:1,cityId:"https://evil.example"})])expect(()=>parseDefaultCity(value)).toThrow();
 });
 it("rejects other accounts, tampering, future events and unrelated settings",()=>{
  const secret=generateSecretKey(),pubkey=getPublicKey(secret);
  const event=finalizeEvent({kind:30078,created_at:10,tags:[["d",DEFAULT_CITY_TAG]],content:"opaque encrypted payload"},secret);
  expect(latestDefaultCity([event],pubkey)?.id).toBe(event.id);
  expect(latestDefaultCity([event],getPublicKey(generateSecretKey()))).toBeUndefined();
  expect(latestDefaultCity([{...event,content:"tampered"}],pubkey)).toBeUndefined();
  const other=finalizeEvent({kind:30078,created_at:11,tags:[["d","other"]],content:"opaque"},secret);
  const future=finalizeEvent({kind:30078,created_at:Math.floor(Date.now()/1000)+3600,tags:[["d",DEFAULT_CITY_TAG]],content:"opaque"},secret);
  expect(latestDefaultCity([other,future],pubkey)).toBeUndefined();
 });
});
