import { describe,expect,it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { parsePublicProfile, safeLnurl, safeNip05, safeProfilePicture } from "./profiles";
const sk=generateSecretKey();
const signed=(content:string,kind=0)=>finalizeEvent({kind,created_at:1,tags:[],content},sk);
describe("public editor profiles",()=>{
 it("reads a signed display name and safe picture",()=>{
  const e=signed(JSON.stringify({display_name:"Alice",name:"alice",picture:"https://images.example.org/a.jpg"}));
  expect(parsePublicProfile(e,new Set([e.pubkey]))).toEqual({name:"Alice",picture:"https://images.example.org/a.jpg"});
 });
 it("uses name fallback and rejects unrelated or invalid signed data",()=>{
  const e=signed('{"name":"alice"}');
  expect(parsePublicProfile(e,new Set([e.pubkey]))?.name).toBe("alice");
  expect(parsePublicProfile(e,new Set())).toBeNull();
  expect(parsePublicProfile({...JSON.parse(JSON.stringify(e)),sig:"0".repeat(128)},new Set([e.pubkey]))).toBeNull();
  for(const body of ["broken","[]","null"]) {const bad=signed(body);expect(parsePublicProfile(bad,new Set([bad.pubkey]))).toBeNull();}
 });
 it("does not accept dangerous avatar schemes or local literal addresses",()=>{
  for(const url of ["javascript:alert(1)","data:image/png;base64,a","http://example.org/a","https://localhost/a","https://127.0.0.1/a","https://[::1]/a","https://user:pass@example.org/a"]) expect(safeProfilePicture(url)).toBeUndefined();
 });
 it("bounds and cleans display names",()=>{
  const e=signed(JSON.stringify({display_name:"\u202e"+"x".repeat(200)}));
  expect(parsePublicProfile(e,new Set([e.pubkey]))?.name).toBe("x".repeat(100));
 });
 it("reads safe NIP-05 and Lightning metadata",()=>{
  const e=signed(JSON.stringify({name:"Alice",nip05:"alice@example.org",lud16:"alice@getalby.com",lud06:"lnurl1dp68gurn8ghj7"}));
  expect(parsePublicProfile(e,new Set([e.pubkey]))).toEqual({name:"Alice",nip05:"alice@example.org",lnurl:"alice@getalby.com"});
  expect(safeNip05("not an identifier")).toBeUndefined();
  expect(safeLnurl("bad value","lnurl1dp68gurn8ghj7")).toBe("lnurl1dp68gurn8ghj7");
 });
});
