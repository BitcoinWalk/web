"use client";

import {useRef,useState} from "react";
import {nip19} from "nostr-tools";
import {useDashboardAutoLoad} from "./dashboard-context";
import {relayConfig} from "../lib/relay-config";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {assertExactSigned} from "../nostr/moderation";
import {createEventModeration,latestOrganizerModeration,queryOrganizerModerations,requireEventModerationRelay,type EventModerationRecord} from "../nostr/event-moderation";
import {publishVerifiedEvent} from "../nostr/relay";

export default function OrganizerSuspensionPanel(){
 const lock=useRef(false),[busy,setBusy]=useState(false),[npub,setNpub]=useState(""),[target,setTarget]=useState(""),[records,setRecords]=useState<EventModerationRecord[]>([]),[reason,setReason]=useState(""),[message,setMessage]=useState("Enter a host npub to check or change their global publishing access.");
 async function admin(){if(!isSuperAdmin(await getBrowserExtensionPubkey()))throw new Error("Connect the BitcoinWalk super-admin.");}
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await admin();await action();}catch(error){setMessage(error instanceof Error?error.message:"Host suspension failed.");}finally{lock.current=false;setBusy(false);}}
 function key(){try{const decoded=nip19.decode(npub.trim());if(decoded.type==="npub")return decoded.data;}catch{}throw new Error("Enter the host's public npub, not a private key.");}
 async function load(value=key()){
  await requireEventModerationRelay(relayConfig.writeRelays);
  const history=await queryOrganizerModerations(relayConfig.writeRelays,value);
  setTarget(value);setRecords(history);
  const current=latestOrganizerModeration(history,value);
  setMessage(current?.decision.status==="suspended"?"This host is suspended across all BitcoinWalk cities.":"This host's publishing access is active.");
 }
 useDashboardAutoLoad(()=>run(async()=>{await requireEventModerationRelay(relayConfig.writeRelays);setMessage("Enter a host npub to check or change their global publishing access.");}));
 const current=target?latestOrganizerModeration(records,target):undefined,status=current?.decision.status==="suspended"?"suspended":"active";
 async function decide(){await run(async()=>{
  const value=key();if(value!==target)throw new Error("Check this host before changing publishing access.");
  if(!reason.trim())throw new Error("Enter a public reason for this action.");
  await requireEventModerationRelay(relayConfig.writeRelays);
  const fresh=latestOrganizerModeration(await queryOrganizerModerations(relayConfig.writeRelays,value),value);
  if(fresh?.event.id!==current?.event.id)throw new Error("Host suspension changed. Check the host again before continuing.");
  const next=status==="suspended"?"active":"suspended";
  const template=createEventModeration({scope:"organizer",target:value,status:next,reason:reason.trim(),...(fresh?{previous:fresh.event.id}:{})});
  if(!window.confirm(`${next==="suspended"?"SUSPEND":"RESUME"} HOST PUBLISHING\n\nHost: ${nip19.npubEncode(value)}\nScope: every BitcoinWalk city\nReason (public): ${reason.trim()}\n\nExisting walks remain visible and cancellation remains available. Continue?`))return;
  setMessage("Approve the global host decision in your signer…");
  const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();
  const recheck=latestOrganizerModeration(await queryOrganizerModerations(relayConfig.writeRelays,value),value);
  if(recheck?.event.id!==fresh?.event.id)throw new Error("Host suspension changed while signing. Nothing published; check again.");
  await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
  const saved=latestOrganizerModeration(await queryOrganizerModerations(relayConfig.writeRelays,value),value);
  if(saved?.event.id!==signed.id)throw new Error("Relay acknowledged but the global host decision was not confirmed. Check again before retrying.");
  setReason("");await load(value);setMessage(`${next}: global host decision confirmed by relay read-back. Existing walks remain visible.`);
 });}
 return <section><h2>Host publishing access</h2><p>Suspending a host blocks new and edited walks across every BitcoinWalk city. It does not remove permissions, hide existing walks, or prevent cancellation. The reason becomes public signed audit history.</p>
 <label>Host npub<input disabled={busy} value={npub} onChange={event=>{setNpub(event.target.value);setTarget("");setRecords([]);}} placeholder="npub1…"/></label>
 <button type="button" disabled={busy||!npub.trim()} onClick={()=>void run(()=>load())}>Check host</button>
 {target&&<><p><strong>Publishing access: {status}</strong></p><label>Public reason<textarea disabled={busy} value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} placeholder="Required. Do not include private information."/></label><button type="button" disabled={busy||!reason.trim()} onClick={()=>void decide()}>{status==="suspended"?"Resume host publishing":"Suspend host everywhere"}</button></>}
 <p role="status">{message}</p></section>;
}
