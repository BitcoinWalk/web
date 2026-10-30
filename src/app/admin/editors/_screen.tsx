"use client";
import {useDashboard,useDashboardAutoLoad} from "../../../components/dashboard-context";

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
import CityFinder from "../../../components/city-finder";
import {cityOwnerPubkey} from "../../../domain/city";
import {pendingCityEditorRequests,queryCityEditorRequests,type CityEditorRequestRecord} from "../../../nostr/city-editor-requests";

export default function EditorsScreen() {
  const lock=useRef(false);
  const feedbackRef=useRef<HTMLDivElement>(null);
  const [feedback,setFeedback]=useState<{kind:"success"|"error"; title:string; detail:string; addedKey?:string}|null>(null);
  useEffect(()=>{
    if(feedback) feedbackRef.current?.focus();
  },[feedback]);
  const [busy,setBusy]=useState(false);
  const [records,setRecords]=useState<AuthorizationRecord[]>([]);
  const [names,setNames]=useState<Record<string,string>>({});
  const [keywords,setKeywords]=useState<Record<string,string[]>>({});
  const [selected,setSelected]=useState("");
  const [npub,setNpub]=useState("");
  const [message,setMessage]=useState("Connect the BitcoinWalk super-admin to manage city editors.");
  const record=records.find(r=>r.grant.cityId===selected);
  const [profiles,setProfiles]=useState<Record<string,PublicProfile>>({});
  const [requests,setRequests]=useState<CityEditorRequestRecord[]>([]);
  const profileKeys=[...new Set(record?.grant.editorPubkeys ?? [])].sort().join(",");
  useEffect(()=>watchPublicProfiles(profileKeys ? profileKeys.split(",") : [],(key,profile)=>setProfiles(current=>({...current,[key]:profile}))),[profileKeys]);

  async function adminIdentity() {
    const key=await getBrowserExtensionPubkey();
    if(!isSuperAdmin(key)) throw new Error("Select the BitcoinWalk super-admin account in your extension.");
    return key;
  }

  const dashboard=useDashboard();
  useDashboardAutoLoad(load);
  async function load() {
    if(lock.current) return;
    lock.current=true;setBusy(true);setRecords([]);setRequests([]);setNpub("");setFeedback(null);
    setMessage("Loading registered cities from the relay…");
    try {
      if(!relayConfig.readRelays.length) throw new Error("No read relay configured.");
      await adminIdentity();
      const [grants,revisions,editorRequests]=await Promise.all([queryAuthorizations(relayConfig.readRelays),queryCityRevisions(relayConfig.readRelays),queryCityEditorRequests(relayConfig.readRelays)]);
      await adminIdentity();
      const cities=latestCityGrants(grants).filter(r=>!dashboard.selectedCity||r.grant.cityId===dashboard.selectedCity);
      const labels:Record<string,string>={},search:Record<string,string[]>={},timestamps:Record<string,number>={};
      for(const revision of revisions) if((timestamps[revision.city.cityId]??-1)<=revision.event.created_at){
        timestamps[revision.city.cityId]=revision.event.created_at;
        labels[revision.city.cityId]=revision.city.cityName;
        search[revision.city.cityId]=[revision.city.slug,revision.city.cityId,...(revision.city.aliases??[])];
      }
      setNames(labels);setKeywords(search);setRecords(cities);
      setRequests(pendingCityEditorRequests(editorRequests,cities));
      setSelected(current=>dashboard.selectedCity&&cities.some(item=>item.grant.cityId===dashboard.selectedCity)?dashboard.selectedCity:cities.some(item=>item.grant.cityId===current)?current:"");
      setMessage(cities.length ? `${cities.length} registered cities loaded. Select a city to manage its editors.` : "The relay completed the read but returned no registered cities. Check the staging relay selection before creating anything new.");
    } catch(error) {
      const detail=error instanceof Error ? error.message : "Could not load editors.";
      setMessage(detail);setFeedback({kind:"error",title:"Could not load city editors",detail});
    }
    finally {lock.current=false;setBusy(false);}
  }

  async function change(action:"add"|"remove", key?:string, requestedRecord?:AuthorizationRecord) {
    const targetRecord=requestedRecord??record;
    if(lock.current || !targetRecord) return;
    lock.current=true;setBusy(true);setFeedback(null);
    setMessage("Preparing the editor change…");
    let acknowledged=false;
    try {
      if(!relayConfig.writeRelays.length) throw new Error("No write relay configured.");
      const actor=await adminIdentity();
      const target=key ?? editorPublicKey(npub),cityId=targetRecord.grant.cityId;
      const template=editorChange(targetRecord,actor,action,target);
      if(!window.confirm(`${action==="add" ? "Add" : "Remove"} editor\n${nip19.npubEncode(target)}\nCity: ${names[cityId] ?? "Unnamed"}\nUUID: ${cityId}\n\n${action==="remove" ? "New edits from this identity will be refused. Existing approved content is not removed." : "This identity will be able to submit edits for this city."}`)) {setMessage("Cancelled. No permission change was submitted.");return;}
      setMessage("Checking the current editor list…");
      assertGrantUnchanged(targetRecord,await queryCityAuthorization(relayConfig.writeRelays,cityId));
      setMessage("Approve this city permission change in your extension…");
      const signed=await signWithBrowserExtension(template);
      assertPermissionSignature(signed,template,actor);
      await adminIdentity();
      // Do not overwrite a grant changed while the signing prompt was open.
      assertGrantUnchanged(targetRecord,await queryCityAuthorization(relayConfig.writeRelays,cityId));
      await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
      acknowledged=true;
      setMessage("Saved by the relay. Verifying the updated editor list…");
      const current=await queryCityAuthorization(relayConfig.writeRelays,cityId);
      if(!current || current.event.id!==signed.id) throw new Error("Relay acknowledged the update, but the current grant could not be confirmed. Reload before another change; do not blindly retry.");
      setRecords(items=>items.map(item=>item.grant.cityId===cityId ? current : item));setRequests(items=>items.filter(item=>item.request.cityId!==cityId));setNpub("");
      setMessage(`Editor ${action==="add" ? "added" : "removed"}. Relay acknowledgement and read-back verified. Only city ${cityId} was changed.`);
      setFeedback({
        kind:"success",
        title:action==="add" ? "Editor added successfully" : "Editor removed successfully",
        detail:`${nip19.npubEncode(target)} ${action==="add" ? "can now submit edits for" : "no longer has editor access to"} ${names[cityId] ?? "this city"}. The change has been saved and verified on the relay.`,
        ...(action==="add" ? {addedKey:target} : {}),
      });
    } catch(error) {
      const detail=error instanceof Error ? error.message : "Permission update failed.";
      setMessage(detail);
      setFeedback({kind:"error",title:acknowledged ? "Update received — confirmation incomplete" : "Editor change not confirmed",detail});
      if(acknowledged) {setRecords([]);setSelected("");}
    } finally {lock.current=false;setBusy(false);}
  }

  return <section>
    <h2>City editors</h2>
    <p>Enter public npubs only; never paste an nsec. These permissions apply to a whole city, not to hosting one walk.</p>
    <button disabled={busy} onClick={load}>{busy?"Loading editors…":"Refresh city editors"}</button>
    <p role="status" aria-live="polite">{message}</p>
    {!!requests.length&&<section><h2>Owner requests</h2><p>Each request was signed by the current city owner against the exact editor list shown when they submitted it. Your signature applies the final permission change.</p><ul>{requests.map(row=>{const ownerRecord=records.find(item=>item.grant.cityId===row.request.cityId);return <li key={row.event.id}><strong>{names[row.request.cityId]??"City"}</strong>{" — "}{row.request.action==="add"?"Add":"Remove"} <code>{nip19.npubEncode(row.request.editorPubkey)}</code>{ownerRecord&&<button disabled={busy} onClick={()=>void change(row.request.action,row.request.editorPubkey,ownerRecord)}>Review and apply</button>}</li>;})}</ul></section>}
    <CityFinder disabled={busy||!records.length} label="City" placeholder="Search cities to manage editors…" value={selected} onChange={cityId=>{setSelected(cityId);setNpub("");setFeedback(null);}} items={records.map(item=>({id:item.grant.cityId,name:names[item.grant.cityId]??"City",keywords:keywords[item.grant.cityId]??[item.grant.cityId]}))}/>
    {feedback && <div ref={feedbackRef} tabIndex={-1} role={feedback.kind==="success" ? "status" : "alert"} aria-atomic="true" className={`${styles.feedback} ${feedback.kind==="success" ? styles.success : styles.error}`}>
      <strong>{feedback.kind==="success" ? "✓ " : "! "}{feedback.title}</strong>
      <p>{feedback.detail}</p>
    </div>}
    {record && <section>
      <h2>{names[selected] ?? "City editors"}</h2><p>City UUID: {selected}</p>
      <p>The current owner cannot be removed. After an ownership transfer, the original creator remains immutable historical provenance but no longer has to retain access. The super-admin always retains access to every city.</p>
      <p>Names and photos come from public Nostr profiles and are not identity verification. Always check the npub. Profile relays receive these public-key lookups; external image hosts receive avatar requests.</p>
      <ul className={styles.editors}>{[...new Set(record.grant.editorPubkeys)].map(key=>{const owner=cityOwnerPubkey(record.grant);return <li key={key} className={feedback?.addedKey===key ? styles.added : undefined}><EditorIdentity pubkey={key} profile={profiles[key]} />{feedback?.addedKey===key && <strong className={styles.badge}>✓ Just added</strong>}{key===owner ? " — Owner (protected)" : isSuperAdmin(key) ? " — Super-admin (protected)" : <>{key===record.grant.creatorPubkey?" — Original creator ":" "}<button disabled={busy} onClick={()=>change("remove",key)}>Remove editor</button></>}</li>;})}</ul>
      <form onSubmit={event=>{event.preventDefault();void change("add");}}>
        <label>New editor npub <input value={npub} onChange={e=>setNpub(e.target.value)} placeholder="npub1…" autoComplete="off" spellCheck={false} disabled={busy} required /></label>
        <button disabled={busy} type="submit">{busy ? "Updating editor access…" : "Add editor"}</button>
        {busy && <p role="status">{message}</p>}
      </form>
      <p>Changes require an explicit super-admin signature. They do not approve pending walks or change chat membership.</p>
    </section>}
  </section>;
}
