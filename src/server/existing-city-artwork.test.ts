import {describe,it,expect,vi} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {existingCityArtwork} from "./existing-city-artwork";
describe("existing city artwork",()=>{
 const secret=generateSecretKey(),pubkey=getPublicKey(secret),origin="https://bitcoinwalk.org",relays=["wss://one.example","wss://two.example"];
 const profile={name:"BitcoinWalk Hannover",picture:origin+"/hannover.jpg",website:origin+"/hannover"};
 const signed=(data=profile)=>finalizeEvent({kind:0,created_at:Math.floor(Date.now()/1000),tags:[],content:JSON.stringify(data)},secret);
 it("reuses exact signed artwork on two relays with verified NIP-05",async()=>{
  const event=signed(),read=vi.fn().mockResolvedValue([event]);
  expect(await existingCityArtwork(pubkey,"Hannover","hannover",origin,relays,read,vi.fn().mockResolvedValue(true))).toMatchObject({avatar:{url:profile.picture},banner:{url:profile.picture}});
 });
 it("does not accept unverified mappings, one relay, conflicting or invalid profiles",async()=>{
  const event=signed(),read=vi.fn().mockResolvedValue([event]),yes=vi.fn().mockResolvedValue(true);
  expect(await existingCityArtwork(pubkey,"Hannover","hannover",origin,relays,read,vi.fn().mockResolvedValue(false))).toBeNull();
  expect(await existingCityArtwork(pubkey,"Hannover","hannover",origin,[relays[0],relays[0]],read,yes)).toBeNull();
  expect(await existingCityArtwork(pubkey,"Hannover","hannover",origin,relays,vi.fn().mockResolvedValue([{...JSON.parse(JSON.stringify(event)),sig:"bad"}]),yes)).toBeNull();
  expect(await existingCityArtwork(pubkey,"Hannover","hannover",origin,relays,vi.fn().mockResolvedValue([signed({...profile,website:"https://example.com"})]),yes)).toBeNull();
  expect(await existingCityArtwork(pubkey,"Hannover","hannover",origin,relays,vi.fn().mockResolvedValueOnce([event]).mockResolvedValueOnce([]),yes)).toBeNull();
 });
});
