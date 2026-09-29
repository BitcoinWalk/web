import {SimplePool,compareEvents,verifyEvent,getEventHash,nip19,type Event} from "nostr-tools";
import {createWrap} from "nostr-tools/nip59";
import {profileRelays} from "./profiles";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "./signer";
import {isSuperAdmin} from "./authority";

export function inviteRecipient(value:string):string{
 const decoded=nip19.decode(value.trim());if(decoded.type!=="npub")throw new Error("Enter a valid npub, not an nsec or event link.");return decoded.data;
}
export function publicInviteURL(value:string):string{
 const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.hash||u.search||u.port||!u.hostname.includes(".")||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(":")||/(?:^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)||u.pathname!=="/start")throw new Error("Use the publicly deployed HTTPS registration URL ending in /start, without query parameters. Localhost links cannot be sent.");return u.href;
}
export function invitationText(url:string){return `You're invited by BitcoinWalk to organize a walk in your city!\n\nCreate your BitcoinWalk here: ${publicInviteURL(url)}\n\nYou can organize a walk using your existing Nostr identity without renaming your personal account. If you prefer a separate account called "BitcoinWalk in [City]", create a new Nostr identity (a new key pair and npub) in your signer, back up its private key securely, and select that identity before submitting. This keeps your personal account separate; it does not guarantee anonymity.\n\nNew to Nostr? Create an identity in a Nostr signer first, then connect it on the registration page. Never send us your private key (nsec) or paste it into BitcoinWalk.\n\nRegistration is open; this invitation does not grant editor access or automatic approval. The BitcoinWalk team will review your submission.`;}
function validInboxURL(value:string):boolean {try{const u=new URL(value);return u.protocol==="wss:"&&!u.username&&!u.password&&!u.hash&&!u.port&&u.hostname.includes(".")&&!/^[\d.]+$/.test(u.hostname)&&!u.hostname.includes(":")&&!/(?:^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname);}catch{return false;}}
// Announcement discovery is separate from delivery: only signed kind-10050
// preferences below may supply message destinations.
export const inboxDiscoveryRelays=[...new Set((process.env.NEXT_PUBLIC_INBOX_DISCOVERY_RELAYS?.split(",")??[...profileRelays,"wss://relay.ditto.pub/","wss://relay.primal.net/"]).map(value=>value.trim()).filter(validInboxURL).map(value=>new URL(value).href))];
export function inboxRelays(events:Event[],key:string):string[]{
 const newest=events.filter(e=>e.kind===10050&&e.pubkey===key&&e.created_at<=Math.floor(Date.now()/1000)+60&&verifyEvent(e)).sort(compareEvents)[0];
 if(!newest)throw new Error("No signed DM inbox announcement was found on the reachable discovery relays. Publish NIP-17 inbox settings in a compatible client.");
 const relays=[...new Set(newest.tags.filter(t=>t[0]==="relay"&&validInboxURL(t[1]??"")).map(t=>new URL(t[1]).href))];
 if(!relays.length)throw new Error("The latest signed DM inbox list contains no usable public WSS relays. Update the account's NIP-17 inbox settings.");
 if(relays.length>3)throw new Error(`The signed inbox list contains ${relays.length} relays; invitations currently support up to 3.`);
 return relays;
}
export async function readInboxAnnouncements(pool:Pick<SimplePool,"subscribeEose">,key:string,relays=inboxDiscoveryRelays):Promise<Event[]>{
 if(!relays.length)throw new Error("No public inbox discovery relays configured.");
 const results=await Promise.allSettled(relays.map(relay=>new Promise<Event[]>((resolve,reject)=>{
  const found:Event[]=[];let settled=false,subscription:ReturnType<SimplePool["subscribeEose"]>|undefined;
  const timer=setTimeout(()=>{if(settled)return;settled=true;reject(new Error("Inbox discovery timed out."));subscription?.close();},8000);
  try{subscription=pool.subscribeEose([relay],{kinds:[10050],authors:[key],limit:10},{maxWait:10000,
   onevent:event=>{if(!settled)found.push(event);},
   onclose:reasons=>{if(settled)return;settled=true;clearTimeout(timer);if(reasons.length===1&&reasons[0].reason==="closed automatically on eose")resolve(found);else reject(new Error("Inbox discovery relay did not complete its read."));},
  });}catch(error){settled=true;clearTimeout(timer);reject(error);}
 })));
 const complete=results.filter(result=>result.status==="fulfilled");
 if(!complete.length)throw new Error("DM inbox discovery is unavailable: no relay completed its read. Retry when the connection recovers; this does not mean the account has no inbox.");
 return [...new Map(complete.flatMap(result=>result.value).map(event=>[event.id,event])).values()];
}
export async function discoverInbox(key:string):Promise<string[]>{
 const pool=new SimplePool();
 try{return inboxRelays(await readInboxAnnouncements(pool,key),key);}finally{pool.close(inboxDiscoveryRelays);pool.destroy();}
}
export async function discoverInvitationInboxes(recipient:string,author:string):Promise<{to:string[];self:string[]}>{
 const [to,self]=await Promise.allSettled([discoverInbox(recipient),discoverInbox(author)]);
 const detail=(reason:unknown)=>reason instanceof Error?reason.message:String(reason);
 if(to.status==="rejected"||self.status==="rejected")throw new Error([to.status==="rejected"?`Recipient inbox: ${detail(to.reason)}`:"",self.status==="rejected"?`Your sender-copy inbox: ${detail(self.reason)}`:""].filter(Boolean).join(" "));
 return {to:to.value,self:self.value};
}
export function invitationFailureMessage(error:unknown,recipientAcknowledged:boolean,hasPreparedEnvelopes:boolean):string{
 const detail=error instanceof Error?error.message:"Invitation failed.";
 return `${detail}${recipientAcknowledged?" Recipient relay already acknowledged the invitation; retry only completes the saved sender copy.":hasPreparedEnvelopes?" Delivery is not confirmed. Retry reuses the already signed envelopes.":" No invitation was sent."}`;
}
export async function prepareInvitation(recipient:string,content:string):Promise<{recipient:Event;sender:Event;author:string}>{
 const author=await getBrowserExtensionPubkey();if(!isSuperAdmin(author))throw new Error("Select the BitcoinWalk super-admin.");
 return preparePrivateInvitation(recipient,content,author);
}
export async function preparePrivateInvitation(recipient:string,content:string,author:string):Promise<{recipient:Event;sender:Event;author:string}>{
 if(await getBrowserExtensionPubkey()!==author)throw new Error("Signer identity changed. No message sent.");
 const extension=window.nostr;if(!extension?.nip44)throw new Error("This extension needs NIP-44 encryption support to send private invitations. No insecure fallback is used.");
 const unsigned={pubkey:author,kind:14,created_at:Math.floor(Date.now()/1000),tags:[["p",recipient]],content};const rumor={...unsigned,id:getEventHash(unsigned)};
 async function wrap(key:string){
  const ciphertext=await extension!.nip44!.encrypt(key,JSON.stringify(rumor));
  const offset=crypto.getRandomValues(new Uint32Array(1))[0]%172800;
  const template={kind:13,created_at:Math.floor(Date.now()/1000)-offset,tags:[],content:ciphertext};
  const seal=await signWithBrowserExtension(template);
  if(!verifyEvent(seal)||seal.pubkey!==author||seal.kind!==template.kind||seal.created_at!==template.created_at||seal.content!==template.content||JSON.stringify(seal.tags)!==JSON.stringify(template.tags))throw new Error("Signer returned a different account or message. Nothing sent.");
  if(await getBrowserExtensionPubkey()!==author)throw new Error("Signer identity changed. No invitation published.");
  return createWrap(seal,key);
 }
 // Both signatures finish before either encrypted copy leaves the browser.
 const recipientWrap=await wrap(recipient);const senderWrap=await wrap(author);
 return {recipient:recipientWrap,sender:senderWrap,author};
}
