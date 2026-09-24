import {describe,it,expect,vi,afterEach} from "vitest";
import {finalizeEvent,getPublicKey,nip19,nip44,type EventTemplate} from "nostr-tools";
import {unwrapEvent} from "nostr-tools/nip59";
vi.mock("./authority",()=>({isSuperAdmin:(key:string)=>key===getPublicKey(new Uint8Array(32).fill(1))}));
import {inviteRecipient,publicInviteURL,invitationText,inboxRelays,prepareInvitation,preparePrivateInvitation} from "./invitations";
const key=new Uint8Array(32).fill(2),pubkey=getPublicKey(key);
afterEach(()=>vi.unstubAllGlobals());
describe("organizer invitations",()=>{
 it("makes a separate city identity optional and keeps key creation in the signer",()=>{
  const text=invitationText("https://example.com/start");
  expect(text).toContain("without renaming your personal account");
  expect(text).toContain("create a new Nostr identity (a new key pair and npub) in your signer");
  expect(text).toContain("back up its private key securely");
  expect(text).toContain("Never send us your private key (nsec) or paste it into BitcoinWalk");
  expect(text).toContain("does not guarantee anonymity");
 });
 it("accepts only npub recipients",()=>{expect(inviteRecipient(nip19.npubEncode(pubkey))).toBe(pubkey);expect(()=>inviteRecipient(pubkey)).toThrow();expect(()=>inviteRecipient(nip19.nsecEncode(key))).toThrow();});
 it("requires a public registration URL and never grants authority",()=>{
  expect(publicInviteURL("https://staging.example.com/start")).toBe("https://staging.example.com/start");
  for(const url of ["http://localhost:3000/start","https://127.0.0.1/start","https://example.com/","https://example.com/start?npub=abc","https://user:pass@example.com/start"])expect(()=>publicInviteURL(url)).toThrow();
  expect(invitationText("https://example.com/start")).toContain("does not grant editor access or automatic approval");
 });
 it("uses verified inbox preferences, with no arbitrary relay fallback",()=>{
  const e=finalizeEvent({kind:10050,created_at:10,tags:[["relay","wss://inbox.example.com"]],content:""},key);
  expect(inboxRelays([e],pubkey)).toEqual(["wss://inbox.example.com"]);
  expect(()=>inboxRelays([e],"f".repeat(64))).toThrow();
  const latest=finalizeEvent({kind:10050,created_at:11,tags:[],content:""},key);expect(()=>inboxRelays([e,latest],pubkey)).toThrow();
  const tampered=JSON.parse(JSON.stringify(e));tampered.tags=[["relay","wss://evil.example.com"]];expect(()=>inboxRelays([tampered],pubkey)).toThrow();
 });
 it("encrypts separate matching copies for recipient and sender without exporting the sender key",async()=>{
  const senderKey=new Uint8Array(32).fill(1),sender=getPublicKey(senderKey);
  vi.stubGlobal("window",{nostr:{getPublicKey:async()=>sender,signEvent:async(t:EventTemplate)=>finalizeEvent(t,senderKey),nip44:{encrypt:async(to:string,text:string)=>nip44.v2.encrypt(text,nip44.v2.utils.getConversationKey(senderKey,to))}}});
  const result=await prepareInvitation(pubkey,"Private invitation");
  const recipientCopy=unwrapEvent(result.recipient,key),senderCopy=unwrapEvent(result.sender,senderKey);
  expect(recipientCopy).toEqual(senderCopy);expect(recipientCopy.pubkey).toBe(sender);expect(recipientCopy.content).toBe("Private invitation");
  expect(result.recipient.kind).toBe(1059);expect(result.recipient.pubkey).not.toBe(sender);expect(result.recipient.content).not.toContain("Private invitation");
 });
 it("refuses a signer without private-message encryption",async()=>{
  vi.stubGlobal("window",{nostr:{getPublicKey:async()=>getPublicKey(new Uint8Array(32).fill(1))}});
  await expect(prepareInvitation(pubkey,"test")).rejects.toThrow("NIP-44");
 });
 it("supports an organizer-signed private invitation without relaxing the existing admin-only entry point",async()=>{
  const senderKey=new Uint8Array(32).fill(3),sender=getPublicKey(senderKey);
  vi.stubGlobal("window",{nostr:{getPublicKey:async()=>sender,signEvent:async(t:EventTemplate)=>finalizeEvent(t,senderKey),nip44:{encrypt:async(to:string,text:string)=>nip44.v2.encrypt(text,nip44.v2.utils.getConversationKey(senderKey,to))}}});
  await expect(prepareInvitation(pubkey,"test")).rejects.toThrow("super-admin");
  const result=await preparePrivateInvitation(pubkey,"Co-organizer invitation",sender);
  expect(unwrapEvent(result.recipient,key)).toEqual(unwrapEvent(result.sender,senderKey));
  expect(unwrapEvent(result.recipient,key).pubkey).toBe(sender);
  await expect(preparePrivateInvitation(pubkey,"test",pubkey)).rejects.toThrow("Signer identity changed");
 });
});
