"use client";
import {useRef,useState} from "react";
import {inviteRecipient,publicInviteURL,invitationText,discoverInbox,prepareInvitation} from "../nostr/invitations";
import {getBrowserExtensionPubkey,authenticateWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {publishVerifiedEvent} from "../nostr/relay";
import type {EventTemplate} from "nostr-tools";

type Preview={recipient:string;npub:string;url:string;text:string;to:string[];self:string[];author:string};
export default function OrganizerInvitations(){
 const lock=useRef(false);const [busy,setBusy]=useState(false),[npub,setNpub]=useState(""),[url,setURL]=useState(process.env.NEXT_PUBLIC_ORGANIZER_INVITE_URL?.trim()||"https://app-staging.bitcoinwalk.org/start"),[preview,setPreview]=useState<Preview|null>(null),[message,setMessage]=useState("Invitations are private messages, not approval or editor grants. A public registration deployment is required."),[sent,setSent]=useState(false);
 const pending=useRef<Awaited<ReturnType<typeof prepareInvitation>>|null>(null);const recipientAck=useRef(false),senderAck=useRef(false);
 function reset(){setPreview(null);setSent(false);pending.current=null;recipientAck.current=false;senderAck.current=false;}
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await fn();}catch(e){setMessage(`${e instanceof Error?e.message:"Invitation failed."}${recipientAck.current?" Recipient relay already acknowledged the invitation; retry only completes the saved sender copy.":" Delivery is not confirmed. Retry reuses any already signed envelopes."}`);}finally{lock.current=false;setBusy(false);}}
 async function prepare(){await run(async()=>{reset();const author=await getBrowserExtensionPubkey();if(!isSuperAdmin(author))throw new Error("Select the super-admin in your extension.");const recipient=inviteRecipient(npub);if(recipient===author)throw new Error("Choose an organizer other than the super-admin.");const link=publicInviteURL(url);setMessage("Looking up signed DM inbox preferences on public relays…");const [to,self]=await Promise.all([discoverInbox(recipient),discoverInbox(author)]);setPreview({recipient,npub:npub.trim(),url:link,text:invitationText(link),to,self,author});setMessage("Review the recipient, public link, message and relay destinations. Nothing sent yet.");});}
 async function send(){if(!preview||sent)return;await run(async()=>{
  if(await getBrowserExtensionPubkey()!==preview.author)throw new Error("Signer identity changed.");
  if(!window.confirm(`Send this private invitation to ${preview.npub}?\n\n${preview.text}\n\nRecipient relays: ${preview.to.join(", ")}\nSender-copy relays: ${preview.self.join(", ")}\nThese relays may learn your authentication identity. Confirm the registration page is live and reachable.`))return;
  setMessage("Approve encryption and the two encrypted-message signatures in your extension…");
  pending.current??=await prepareInvitation(preview.recipient,preview.text);
  const auth=async(template:EventTemplate)=>{if(await getBrowserExtensionPubkey()!==preview.author)throw new Error("Signer changed.");const signed=await authenticateWithBrowserExtension(template);if(signed.pubkey!==preview.author)throw new Error("Wrong authentication identity.");return signed;};
  if(!recipientAck.current){await publishVerifiedEvent(pending.current.recipient,preview.to,1,auth);recipientAck.current=true;}
  if(!senderAck.current){await publishVerifiedEvent(pending.current.sender,preview.self,1,auth);senderAck.current=true;}
  setSent(true);setMessage("Recipient inbox and sender-copy relays acknowledged the invitation. This confirms relay acceptance, not that the recipient has read it.");
 });}
 return <section><h2>Invite an organizer</h2><p>No npub or private key is placed in the registration link. The message is encrypted; your extension signs as super-admin. Localhost is not a usable invitation destination.</p><label>Recipient npub<input disabled={busy} value={npub} onChange={e=>{reset();setNpub(e.target.value);}} placeholder="npub1…" autoComplete="off"/></label><label>Public registration URL<input disabled={busy} value={url} onChange={e=>{reset();setURL(e.target.value);}} placeholder="https://your-deployed-site/start" type="url"/></label><button disabled={busy} onClick={prepare}>Preview invitation and check inboxes</button><p role="status">{message}</p>{preview&&<div><p style={{overflowWrap:"anywhere"}}>To: {preview.npub}</p><p style={{whiteSpace:"pre-wrap"}}>{preview.text}</p><p>Recipient relays: {preview.to.join(", ")}<br/>Sender-copy relays: {preview.self.join(", ")}</p><button disabled={busy||sent} onClick={send}>{sent?"Invitation acknowledged":"Sign and send invitation"}</button></div>}</section>;
}
