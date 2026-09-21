"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./feedback.module.css";
import { nip19 } from "nostr-tools";
import { relayConfig } from "../../../lib/relay-config";
import { isSuperAdmin } from "../../../nostr/authority";
import { queryAuthorizations, queryCityAuthorization, queryCityRevisions, type AuthorizationRecord } from "../../../nostr/city-records";
import { assertGrantUnchanged, assertPermissionSignature, editorChange, editorPublicKey, latestCityGrants } from "../../../nostr/editor-management";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../../nostr/signer";
import { publishVerifiedEvent } from "../../../nostr/relay";
import EditorIdentity from "../../../components/editor-identity";
import { watchPublicProfiles, type PublicProfile } from "../../../nostr/profiles";

export default function EditorsPage() {
  const lock=useRef(false);
  const feedbackRef=useRef<HTMLDivElement>(null);
  const [feedback,setFeedback]=useState<{kind:"success"|"error"; title:string; detail:string; addedKey?:string}|null>(null);
  useEffect(()=>{
    if(feedback) feedbackRef.current?.focus();
  },[feedback]);
  const [busy,setBusy]=useState(false);
  const [records,setRecords]=useState<AuthorizationRecord[]>([]);
  const [names,setNames]=useState<Record<string,string>>({});
  const [selected,setSelected]=useState("");
  const [npub,setNpub]=useState("");
  const [message,setMessage]=useState("Connect the BitcoinWalk super-admin to manage city editors.");
  const record=records.find(r=>r.grant.cityId===selected);
  const [profiles,setProfiles]=useState<Record<string,PublicProfile>>({});
  const profileKeys=[...new Set(record?.grant.editorPubkeys ?? [])].sort().join(",");
  useEffect(()=>watchPublicProfiles(profileKeys ? profileKeys.split(",") : [],(key,profile)=>setProfiles(current=>({...current,[key]:profile}))),[profileKeys]);

  async function adminIdentity() {
    const key=await getBrowserExtensionPubkey();
    if(!isSuperAdmin(key)) throw new Error("Select the BitcoinWalk super-admin account in your extension.");
    return key;
  }

  async function load() {
    if(lock.current) return;
    lock.current=true;setBusy(true);setRecords([]);setSelected("");setNpub("");setFeedback(null);
    setMessage("Loading registered cities from the relay…");
    try {
      if(!relayConfig.readRelays.length) throw new Error("No read relay configured.");
      await adminIdentity();
      const [grants,revisions]=await Promise.all([queryAuthorizations(relayConfig.readRelays),queryCityRevisions(relayConfig.readRelays)]);
      await adminIdentity();
      const cities=latestCityGrants(grants);
      const labels:Record<string,string>={};
      for(const revision of revisions) labels[revision.city.cityId]=revision.city.cityName;
      setNames(labels);setRecords(cities);
      setMessage(cities.length ? `${cities.length} registered cities loaded. Select a city to manage its editors.` : "The relay completed the read but returned no registered cities. Check the staging relay selection before creating anything new.");
    } catch(error) {
      const detail=error instanceof Error ? error.message : "Could not load editors.";
      setMessage(detail);setFeedback({kind:"error",title:"Could not load city editors",detail});
    }
    finally {lock.current=false;setBusy(false);}
  }

  async function change(action:"add"|"remove", key?:string) {
    if(lock.current || !record) return;
    lock.current=true;setBusy(true);setFeedback(null);
    setMessage("Preparing the editor change…");
    let acknowledged=false;
    try {
      if(!relayConfig.writeRelays.length) throw new Error("No write relay configured.");
      const actor=await adminIdentity();
      const target=key ?? editorPublicKey(npub);
      const template=editorChange(record,actor,action,target);
      if(!window.confirm(`${action==="add" ? "Add" : "Remove"} editor\n${nip19.npubEncode(target)}\nCity: ${names[selected] ?? "Unnamed"}\nUUID: ${selected}\n\n${action==="remove" ? "New edits from this identity will be refused. Existing approved content is not removed." : "This identity will be able to submit edits for this city."}`)) {setMessage("Cancelled. No permission change was submitted.");return;}
      setMessage("Checking the current editor list…");
      assertGrantUnchanged(record,await queryCityAuthorization(relayConfig.writeRelays,selected));
      setMessage("Approve this city permission change in your extension…");
      const signed=await signWithBrowserExtension(template);
      assertPermissionSignature(signed,template,actor);
      await adminIdentity();
      // Do not overwrite a grant changed while the signing prompt was open.
      assertGrantUnchanged(record,await queryCityAuthorization(relayConfig.writeRelays,selected));
      await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
      acknowledged=true;
      setMessage("Saved by the relay. Verifying the updated editor list…");
      const current=await queryCityAuthorization(relayConfig.writeRelays,selected);
      if(!current || current.event.id!==signed.id) throw new Error("Relay acknowledged the update, but the current grant could not be confirmed. Reload before another change; do not blindly retry.");
      setRecords(items=>items.map(item=>item.grant.cityId===selected ? current : item));setNpub("");
      setMessage(`Editor ${action==="add" ? "added" : "removed"}. Relay acknowledgement and read-back verified. Only city ${selected} was changed.`);
      setFeedback({
        kind:"success",
        title:action==="add" ? "Editor added successfully" : "Editor removed successfully",
        detail:`${nip19.npubEncode(target)} ${action==="add" ? "can now submit edits for" : "no longer has editor access to"} ${names[selected] ?? "this city"}. The change has been saved and verified on the relay.`,
        ...(action==="add" ? {addedKey:target} : {}),
      });
    } catch(error) {
      const detail=error instanceof Error ? error.message : "Permission update failed.";
      setMessage(detail);
      setFeedback({kind:"error",title:acknowledged ? "Update received — confirmation incomplete" : "Editor change not confirmed",detail});
      if(acknowledged) {setRecords([]);setSelected("");}
    } finally {lock.current=false;setBusy(false);}
  }

  return <main>
    <p>BitcoinWalk / admin / editors</p><h1>City editor access</h1>
    <p><Link href="/admin">Approvals</Link>{" · "}<Link href="/organizer">Organizer editor</Link></p>
    <p>Staging relay: {relayConfig.writeRelays.join(", ")}. Permission lists are public. Enter public npubs only; never paste an nsec.</p>
    <button disabled={busy} onClick={load}>Connect and load city editors</button>
    <p role="status" aria-live="polite">{message}</p>
    {!!records.length && <label>City <select disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);setNpub("");setFeedback(null);}}><option value="">Select a city</option>{records.map(r=><option key={r.grant.cityId} value={r.grant.cityId}>{names[r.grant.cityId] ?? "City"} — {r.grant.cityId}</option>)}</select></label>}
    {feedback && <div ref={feedbackRef} tabIndex={-1} role={feedback.kind==="success" ? "status" : "alert"} aria-atomic="true" className={`${styles.feedback} ${feedback.kind==="success" ? styles.success : styles.error}`}>
      <strong>{feedback.kind==="success" ? "✓ " : "! "}{feedback.title}</strong>
      <p>{feedback.detail}</p>
    </div>}
    {record && <section>
      <h2>{names[selected] ?? "City editors"}</h2><p>City UUID: {selected}</p>
      <p>The creator cannot be removed or reassigned. The super-admin always retains access to every city.</p>
      <p>Names and photos come from public Nostr profiles and are not identity verification. Always check the npub. Profile relays receive these public-key lookups; external image hosts receive avatar requests.</p>
      <ul className={styles.editors}>{[...new Set(record.grant.editorPubkeys)].map(key=><li key={key} className={feedback?.addedKey===key ? styles.added : undefined}><EditorIdentity pubkey={key} profile={profiles[key]} />{feedback?.addedKey===key && <strong className={styles.badge}>✓ Just added</strong>}{key===record.grant.creatorPubkey ? " — Creator (protected)" : isSuperAdmin(key) ? " — Super-admin (protected)" : <>{" "}<button disabled={busy} onClick={()=>change("remove",key)}>Remove editor</button></>}</li>)}</ul>
      <form onSubmit={event=>{event.preventDefault();void change("add");}}>
        <label>New editor npub <input value={npub} onChange={e=>setNpub(e.target.value)} placeholder="npub1…" autoComplete="off" spellCheck={false} disabled={busy} required /></label>
        <button disabled={busy} type="submit">{busy ? "Updating editor access…" : "Add editor"}</button>
        {busy && <p role="status">{message}</p>}
      </form>
      <p>Changes require an explicit super-admin signature. They do not approve pending walks or change chat membership.</p>
    </section>}
  </main>;
}
