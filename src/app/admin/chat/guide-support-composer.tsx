"use client";

import {useEffect,useRef,useState,type FormEvent} from "react";
import {authenticateWithBrowserExtension} from "../../../nostr/signer";
import {discoverInbox,preparePrivateInvitation} from "../../../nostr/invitations";
import {publishVerifiedEvent} from "../../../nostr/relay";
import styles from "./chat.module.css";

type Delivery={content:string;envelopes:Awaited<ReturnType<typeof preparePrivateInvitation>>;recipient:boolean;sender:boolean};

export default function GuideSupportComposer({guidePubkey,actor,onRefresh}:{guidePubkey:string;actor:string;onRefresh:()=>void}){
 const [guideRelays,setGuideRelays]=useState<string[]>([]),[ownRelays,setOwnRelays]=useState<string[]>([]),[draft,setDraft]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false),delivery=useRef<Delivery|null>(null);
 useEffect(()=>{let active=true;if(!guidePubkey||!actor)return;void Promise.all([discoverInbox(guidePubkey),discoverInbox(actor)]).then(([guide,own])=>{if(active){setGuideRelays(guide);setOwnRelays(own);}}).catch(()=>{});return()=>{active=false;};},[guidePubkey,actor]);
 async function send(event:FormEvent){event.preventDefault();const content=draft.trim();if(!content||busy||!guideRelays.length||!ownRelays.length)return;if(delivery.current?.recipient&&delivery.current.content!==content){setDraft(delivery.current.content);setStatus("Finish saving the sender copy before starting another message.");return;}setBusy(true);setStatus("Approve the encrypted support message in your signer…");try{if(delivery.current?.content!==content)delivery.current={content,envelopes:await preparePrivateInvitation(guidePubkey,content,actor),recipient:false,sender:false};const saved=delivery.current;if(!saved.recipient){await publishVerifiedEvent(saved.envelopes.recipient,guideRelays,1,authenticateWithBrowserExtension);saved.recipient=true;}if(!saved.sender){await publishVerifiedEvent(saved.envelopes.sender,ownRelays,1,authenticateWithBrowserExtension);saved.sender=true;}delivery.current=null;setDraft("");setStatus("Message stored by the Guide inbox relay. This does not confirm that it has been read or answered.");onRefresh();}catch(error){const detail=error instanceof Error?error.message:"The support message could not be sent.";setStatus(`${detail} ${delivery.current?.recipient?"The Guide inbox already stored the exact message; retry only saves your sender copy.":"Your draft is still here."}`);}finally{setBusy(false);}}
 if(!guideRelays.length||!ownRelays.length)return null;
 return <div className={styles.guideSupportComposer}>
  {status&&<p role="status" aria-live="polite">{status}</p>}
  <form onSubmit={send}><label htmlFor="guide-support-message" className={styles.srOnly}>Message BitcoinWalk Guide support</label><textarea id="guide-support-message" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={4000} disabled={busy} placeholder="Ask BitcoinWalk Guide for help…"/><button type="submit" disabled={busy||!draft.trim()}>{busy?"Signing…":"Send privately"}</button></form>
  <div><span>Private NIP-17 support · relay storage is not a read receipt</span><button type="button" onClick={onRefresh}>Refresh messages</button></div>
 </div>;
}
