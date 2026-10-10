"use client";

import {useEffect, useRef, useState, type ChangeEvent} from "react";
import {finalizeEvent, generateSecretKey, getPublicKey, nip19, SimplePool, verifyEvent, type Event} from "nostr-tools";
import {BunkerSigner, parseBunkerInput} from "nostr-tools/nip46";
import type {NostrBrowserExtension} from "../nostr/signer";
import {signWithBrowserExtension} from "../nostr/signer";
import {authorizeProSetup, citySignerProofTemplate, proSetupTemplate} from "../nostr/pro-setup-command";
import {cityBrandProofTemplate, type CityBrandChallenge} from "../nostr/city-brand";
import {authorizeCityProfile, cityProfileTemplate, type ManagedCityProfile} from "../nostr/city-profile";
import {profileRelays} from "../nostr/profiles";
import {publishVerifiedEvent} from "../nostr/relay";

type RemoteSession = {close(): Promise<void>};
type SavedSigner = {configured: boolean; pubkey?: string; version?: number};
type Activation = {requestId: string; expiresAt: number; proofsReady: boolean};
export function citySignerConnectionError(key: string, actor: string, saved: SavedSigner) {
  if (!/^[0-9a-f]{64}$/.test(key)) return "The city signer returned an invalid public key.";
  if (saved.pubkey && key !== saved.pubkey) return "This key does not match the saved city identity. Reconnect the expected signer, or clear the saved signer before replacing it.";
  if (key === actor && saved.pubkey !== actor) return "Use a separate city identity, not your personal dashboard identity.";
  return null;
}
function localSigner(secret: Uint8Array): NostrBrowserExtension {const pubkey = getPublicKey(secret); return {getPublicKey: async () => pubkey, signEvent: async template => finalizeEvent(structuredClone(template), secret)};}
function remoteSigner(signer: BunkerSigner): NostrBrowserExtension {return {getPublicKey: () => signer.getPublicKey(), signEvent: template => signer.signEvent(template)};}
function decodeNsec(value: string) {const decoded = nip19.decode(value.trim()); if (decoded.type !== "nsec" || !(decoded.data instanceof Uint8Array)) throw new Error("Enter a valid nsec1 private key."); return decoded.data;}
function short(value: string) {const npub = nip19.npubEncode(value); return `${npub.slice(0, 12)}…${npub.slice(-8)}`;}
function downloadBackup(nsec: string, cityName: string) {
  const text = ["BitcoinWalk city signer backup", "", `CITY: ${cityName}`, "PRIVATE KEY — KEEP SECRET", "Anyone with this nsec can control the city identity.",
    "Never upload it or share it with BitcoinWalk support.", "", "nsec:", nsec, "", "Import this key into a trusted signer, retain one protected offline backup, and delete insecure extra copies."].join("\n");
  const url = URL.createObjectURL(new Blob([text], {type: "text/plain;charset=utf-8"})), anchor = document.createElement("a");
  anchor.href = url; anchor.download = `bitcoinwalk-${cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "city"}-signer.txt`;
  anchor.hidden = true; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CitySignerSetup({cityId, cityName, actor, saved, activation, setupReady, profile, busy: parentBusy, onSaved, onActivation}: {
  cityId: string; cityName: string; actor: string; saved: SavedSigner; activation?: Activation; setupReady: boolean; busy: boolean;
  profile?: ManagedCityProfile;
  onSaved(value: SavedSigner, message: string): void; onActivation(value: Activation | undefined, message: string): void;
}) {
  const signer = useRef<NostrBrowserExtension | null>(null), remote = useRef<RemoteSession | null>(null), file = useRef<HTMLInputElement>(null);
  const [pubkey, setPubkey] = useState(""), [input, setInput] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [clock, setClock] = useState(() => Date.now());
  useEffect(() => () => {void remote.current?.close();}, []);
  useEffect(() => {
    if (!activation) return;
    const remaining = activation.expiresAt * 1000 - Date.now();
    if (remaining <= 0) {queueMicrotask(() => setClock(Date.now())); return;}
    const timer = window.setTimeout(() => setClock(Date.now()), remaining + 50);
    return () => window.clearTimeout(timer);
  }, [activation]);
  async function install(next: NostrBrowserExtension, session: RemoteSession | null, note: string) {
    const key = await next.getPublicKey();
    const connectionError = citySignerConnectionError(key, actor, saved);
    if (connectionError) throw new Error(connectionError);
    if (remote.current && remote.current !== session) await remote.current.close();
    signer.current = next; remote.current = session; setPubkey(key); setAcknowledged(false); setMessage(note);
  }
  async function run(work: () => Promise<void>) {if (busy || parentBusy) return; setBusy(true); setMessage(""); try {await work();} catch (error) {setMessage(error instanceof Error ? error.message : "City signer connection failed.");} finally {setBusy(false);}}
  function create() {void run(async () => {const secret = generateSecretKey(); downloadBackup(nip19.nsecEncode(secret), cityName); await install(localSigner(secret), null, "New city signer created. Store the downloaded recovery file safely, then acknowledge the backup below.");});}
  function connectExistingCityAccount(){void run(async()=>{
    if(saved.pubkey!==actor||!window.nostr)throw new Error("This option is available only for an already-attested city account connected to the dashboard.");
    await install({getPublicKey:()=>window.nostr!.getPublicKey(),signEvent:template=>signWithBrowserExtension(template)},null,"Existing attested city account connected. No new identity was created.");
  });}
  function connectInput() {void run(async () => {
    const value = input.trim();
    if (value.startsWith("nsec1")) await install(localSigner(decodeNsec(value)), null, "City key loaded in this page only.");
    else if (value.startsWith("bunker://")) {const pointer = await parseBunkerInput(value); if (!pointer) throw new Error("Enter a valid bunker:// connection."); const bunker = BunkerSigner.fromBunker(generateSecretKey(), pointer, {onauth: url => window.open(url, "_blank", "noopener,noreferrer")}); try {await bunker.connect({name: `BitcoinWalk in ${cityName}`, url: window.location.origin}); await install(remoteSigner(bunker), bunker, "Remote city signer connected.");} catch (error) {await bunker.close(); throw error;}}
    else throw new Error("Enter an nsec1 key or bunker:// connection.");
    setInput("");
  });}
  async function loadFile(event: ChangeEvent<HTMLInputElement>) {const selected = event.target.files?.[0]; event.target.value = ""; if (!selected) return; if (selected.size > 64 * 1024) {setMessage("That key file is too large."); return;} const value = (await selected.text()).match(/\bnsec1[0-9a-z]+\b/i)?.[0] ?? ""; setInput(value.toLowerCase()); setMessage(value ? "City key loaded from the file. Select Connect." : "No valid nsec1 key was found.");}
  function disconnect() {void remote.current?.close(); remote.current = null; signer.current = null; setPubkey(""); setAcknowledged(false); setMessage("");}
  function confirm() {void run(async () => {
    if (!signer.current || !pubkey || !acknowledged) throw new Error("Connect the city signer and acknowledge its recovery method first.");
    if (saved.pubkey && saved.pubkey !== pubkey) throw new Error("Clear the saved city signer before replacing it with a different identity.");
    const command = {action: "confirm-city-signer" as const, cityId, brandPubkey: pubkey, backupAcknowledged: true as const}, origin = window.location.origin;
    const brandProof = await signer.current.signEvent(citySignerProofTemplate(command, origin));
    if (brandProof.pubkey !== pubkey || await signer.current.getPublicKey() !== pubkey) throw new Error("City signer identity changed while signing. Reconnect and try again.");
    const ownerEvent = await signWithBrowserExtension(proSetupTemplate(command, origin));
    if (ownerEvent.pubkey !== actor || JSON.stringify(authorizeProSetup(ownerEvent, origin)) !== JSON.stringify(command)) throw new Error("Dashboard identity changed while authorizing the city signer.");
    const response = await fetch("/api/pro-setup", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({event: ownerEvent, brandProof}), signal: AbortSignal.timeout(60_000)});
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "City signer could not be confirmed.");
    onSaved({configured: true, pubkey: body.signer.pubkey, version: body.signer.version}, body.signer.message);
  });}
  function clearSaved() {void run(async () => {const command = {action: "clear-city-signer" as const, cityId}, origin = window.location.origin; const event = await signWithBrowserExtension(proSetupTemplate(command, origin)); if (event.pubkey !== actor) throw new Error("Dashboard identity changed."); const response = await fetch("/api/pro-setup", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({event}), signal: AbortSignal.timeout(60_000)}); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Saved signer could not be cleared."); onSaved({configured: false}, body.signer.message); disconnect();});}
  function submitActivation() {void run(async () => {
    if (!signer.current || !saved.pubkey || pubkey !== saved.pubkey) throw new Error("Reconnect the exact saved city signer first.");
    if (!setupReady) throw new Error("Confirm the payout destination and city signer before preparing activation.");
    const origin=window.location.origin,prepareCommand={action:"prepare-brand-request" as const,cityId};
    const prepareEvent=await signWithBrowserExtension(proSetupTemplate(prepareCommand,origin));
    const prepared=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:prepareEvent}),signal:AbortSignal.timeout(60_000)}),preparedBody=await prepared.json();
    if(!prepared.ok)throw new Error(preparedBody.error||"Activation request could not be prepared.");
    const challenge=preparedBody.request as CityBrandChallenge;
    if(challenge.binding.brandPubkey!==pubkey||challenge.authority.ownerPubkey!==actor||challenge.authority.cityId!==cityId)throw new Error("Prepared activation request did not match the connected identities.");
    const ownerProof=await signWithBrowserExtension(cityBrandProofTemplate(challenge,"owner"));
    const brandProof=await signer.current.signEvent(cityBrandProofTemplate(challenge,"brand"));
    if(ownerProof.pubkey!==actor||brandProof.pubkey!==pubkey||await signer.current.getPublicKey()!==pubkey)throw new Error("An identity changed while signing the activation request.");
    const submitCommand={action:"submit-brand-proofs" as const,cityId,requestId:challenge.requestId},event=await signWithBrowserExtension(proSetupTemplate(submitCommand,origin));
    const response=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,ownerProof,brandProof}),signal:AbortSignal.timeout(60_000)}),body=await response.json();
    if(!response.ok)throw new Error(body.error||"Activation proofs could not be saved.");
    onActivation({requestId:body.request.requestId,expiresAt:body.request.expiresAt,proofsReady:true},body.request.message);
  });}
  function cancelActivation(){if(!activation)return;void run(async()=>{const origin=window.location.origin,command={action:"cancel-brand-request" as const,cityId,requestId:activation.requestId},event=await signWithBrowserExtension(proSetupTemplate(command,origin));const response=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60_000)}),body=await response.json();if(!response.ok)throw new Error(body.error||"Activation request could not be cancelled.");onActivation(undefined,body.request.message);});}
  function publishProfile(){void run(async()=>{
    if(!signer.current||!saved.pubkey||pubkey!==saved.pubkey||!profile?.nip05)throw new Error("Reconnect the exact saved city signer after NIP-05 activation.");
    if(profileRelays.length<2)throw new Error("At least two public profile relays are required.");
    const pool=new SimplePool();let previous:Event|undefined;
    try{
      const events=await pool.querySync(profileRelays,{kinds:[0],authors:[pubkey],limit:100},{maxWait:6000});
      previous=events.filter(event=>verifyEvent(event)&&event.pubkey===pubkey&&event.kind===0).sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id))[0];
    }finally{pool.close(profileRelays);pool.destroy();}
    const template=cityProfileTemplate(profile,previous),signed=await signer.current.signEvent(template);authorizeCityProfile(signed,pubkey,template);
    const published=await publishVerifiedEvent(signed,profileRelays,2),readPool=new SimplePool();
    try{
      const read=await Promise.all(published.accepted.map(async relay=>(await readPool.querySync([relay],{ids:[signed.id],kinds:[0],authors:[pubkey],limit:1},{maxWait:8000})).some(event=>event.id===signed.id&&verifyEvent(event))));
      if(read.filter(Boolean).length<2)throw new Error("The signed city profile was not read back from two relays. Retry safely with the same city signer.");
    }finally{readPool.close(published.accepted);readPool.destroy();}
    setMessage(`City profile published and verified on ${published.accepted.length} relay(s).`);
  });}
  const mismatch = !!saved.pubkey && !!pubkey && saved.pubkey !== pubkey;
  const activationExpired = !!activation && activation.expiresAt * 1000 <= clock;
  return <fieldset disabled={busy || parentBusy}>
    <legend>Separate city signer</legend>
    <p>This signer controls the public <strong>BitcoinWalk in {cityName}</strong> identity. It never replaces your personal dashboard login.</p>
    {saved.configured && saved.pubkey && <p><strong>Expected city identity:</strong> <code title={nip19.npubEncode(saved.pubkey)}>{short(saved.pubkey)}</code> · version {saved.version}</p>}
    {!pubkey ? <>
      {saved.pubkey===actor&&<><button type="button" onClick={connectExistingCityAccount}>Use connected city identity</button><p><small>This existing city account is already the verified owner and public identity. No replacement account is needed.</small></p></>}
      {!saved.configured && <button type="button" onClick={create}>Create new city identity</button>}
      <p>{saved.configured ? "Reconnect the expected city identity using its remote signer or saved backup:" : "Or connect a city identity kept in a remote signer or load an existing backup:"}</p>
      <label>City private key or bunker signer<input type="password" value={input} onChange={event => setInput(event.target.value)} placeholder="nsec1… or bunker://…" autoComplete="off" spellCheck={false}/></label>
      <input ref={file} type="file" accept=".txt,text/plain" hidden onChange={event => void loadFile(event)}/>
      <button type="button" onClick={() => file.current?.click()}>Load backup file</button> <button type="button" disabled={!input.trim()} onClick={connectInput}>Connect</button>
      <p><small>For isolation, use an nsec backup in this page or a dedicated Amber/Clave bunker. BitcoinWalk never uploads or stores the private key or bunker connection.</small></p>
    </> : <>
      <p><strong>Connected city identity:</strong> <code title={nip19.npubEncode(pubkey)}>{short(pubkey)}</code></p>
      {mismatch && <p role="alert">This is not the saved city identity. Reconnect the expected signer, or clear the saved signer before replacing it.</p>}
      <label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/> I have safely backed up this key or confirmed the remote signer’s recovery method.</label>
      <p><button type="button" disabled={!acknowledged || mismatch} onClick={confirm}>Verify and save city signer</button> <button type="button" onClick={disconnect}>Disconnect from this page</button></p>
      {saved.configured&&saved.pubkey===pubkey&&!activation&&<button type="button" disabled={!setupReady} onClick={submitActivation}>Sign private activation request</button>}
      {saved.configured&&saved.pubkey===pubkey&&profile?.nip05&&<button type="button" onClick={publishProfile}>Publish verified city profile</button>}
    </>}
    {activation&&<p><strong>{activationExpired ? "Activation request expired" : activation.proofsReady?"Awaiting super-admin review":"Activation request prepared"}</strong> · {activationExpired ? "Your saved payout and city signer are unchanged." : <>expires {new Date(activation.expiresAt*1000).toLocaleString()}</>} <button type="button" onClick={activationExpired ? () => onActivation(undefined, "Expired request dismissed. Sign a new activation request when ready; no payment or new identity is required.") : cancelActivation}>{activationExpired ? "Dismiss expired request" : "Cancel request"}</button></p>}
    {saved.configured && <button type="button" onClick={clearSaved}>Clear saved city signer</button>}
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
