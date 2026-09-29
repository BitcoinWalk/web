import {describe,it,expect,vi,afterEach} from "vitest";
import {SimplePool,finalizeEvent,getPublicKey,nip19,nip44,type EventTemplate} from "nostr-tools";
import {unwrapEvent} from "nostr-tools/nip59";
vi.mock("./authority",()=>({isSuperAdmin:(key:string)=>key===getPublicKey(new Uint8Array(32).fill(1))}));
import {inviteRecipient,publicInviteURL,invitationText,inboxRelays,prepareInvitation,preparePrivateInvitation,readInboxAnnouncements,discoverInvitationInboxes,invitationFailureMessage,inboxDiscoveryRelays} from "./invitations";
const key=new Uint8Array(32).fill(2),pubkey=getPublicKey(key);
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
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
  expect(inboxRelays([e],pubkey)).toEqual(["wss://inbox.example.com/"]);
  expect(()=>inboxRelays([e],"f".repeat(64))).toThrow();
  const latest=finalizeEvent({kind:10050,created_at:11,tags:[],content:""},key);expect(()=>inboxRelays([e,latest],pubkey)).toThrow();
  const tampered=JSON.parse(JSON.stringify(e));tampered.tags=[["relay","wss://evil.example.com"]];expect(()=>inboxRelays([tampered],pubkey)).toThrow();
 });
 it("finds signed settings on another discovery relay when the profile relays are unavailable",async()=>{
  const inbox=finalizeEvent({kind:10050,created_at:10,tags:[["relay","wss://recipient.example.com"]],content:""},key);
  vi.spyOn(SimplePool.prototype,"subscribeEose").mockImplementation((relays,_filter,handlers)=>{
   queueMicrotask(()=>{if(relays[0].includes("ditto")){handlers.onevent?.(inbox);handlers.onclose?.([{url:relays[0],reason:"closed automatically on eose"}]);}else handlers.onclose?.([{url:relays[0],reason:"connection failed"}]);});
   return {close:vi.fn()} as ReturnType<SimplePool["subscribeEose"]>;
  });
  const events=await readInboxAnnouncements(new SimplePool(),pubkey);
  expect(inboxDiscoveryRelays).toContain("wss://relay.ditto.pub/");
  expect(inboxDiscoveryRelays).toContain("wss://relay.primal.net/");
  expect(inboxRelays(events,pubkey)).toEqual(["wss://recipient.example.com/"]);
 });
 it("distinguishes failed network discovery from a completed lookup with no inbox",async()=>{
  vi.spyOn(SimplePool.prototype,"subscribeEose").mockImplementation((relays,_filter,handlers)=>{
   queueMicrotask(()=>handlers.onclose?.([{url:relays[0],reason:"connection timed out"}]));
   return {close:vi.fn()} as ReturnType<SimplePool["subscribeEose"]>;
  });
  await expect(readInboxAnnouncements(new SimplePool(),pubkey)).rejects.toThrow("no relay completed its read");
  expect(()=>inboxRelays([],pubkey)).toThrow("No signed DM inbox announcement");
 });
 it("identifies the missing sender-copy inbox when the recipient has settings",async()=>{
  const inbox=finalizeEvent({kind:10050,created_at:10,tags:[["relay","wss://recipient.example.com"]],content:""},key);
  vi.spyOn(SimplePool.prototype,"subscribeEose").mockImplementation((relays,filter,handlers)=>{
   queueMicrotask(()=>{if(filter.authors?.includes(pubkey))handlers.onevent?.(inbox);handlers.onclose?.([{url:relays[0],reason:"closed automatically on eose"}]);});
   return {close:vi.fn()} as ReturnType<SimplePool["subscribeEose"]>;
  });
  await expect(discoverInvitationInboxes(pubkey,getPublicKey(new Uint8Array(32).fill(1)))).rejects.toThrow(/^Your sender-copy inbox:/);
 });
 it("honors the latest signed settings and normalizes equivalent relay URLs",()=>{
  const old=finalizeEvent({kind:10050,created_at:10,tags:[["relay","wss://old.example.com"]],content:""},key);
  const latest=finalizeEvent({kind:10050,created_at:11,tags:[["relay","wss://new.example.com"],["relay","wss://new.example.com/"]],content:""},key);
  expect(inboxRelays([old,latest],pubkey)).toEqual(["wss://new.example.com/"]);
 });
 it("does not imply delivery or signed envelopes after a preview failure",()=>{
  const message=invitationFailureMessage(new Error("Recipient inbox unavailable"),false,false);
  expect(message).toContain("No invitation was sent.");expect(message).not.toContain("signed envelopes");
  expect(invitationFailureMessage(new Error("Network error"),false,true)).toContain("Retry reuses the already signed envelopes");
  expect(invitationFailureMessage(new Error("Sender copy failed"),true,true)).toContain("retry only completes the saved sender copy");
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
