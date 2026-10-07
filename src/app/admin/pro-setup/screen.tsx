"use client";
import Image from "next/image";
import {useRef, useState} from "react";
import CityFinder from "../../../components/city-finder";
import {useDashboard} from "../../../components/dashboard-context";
import {signWithBrowserExtension} from "../../../nostr/signer";
import {authorizeProSetup, proSetupTemplate} from "../../../nostr/pro-setup-command";
import type {ProSetupPreview} from "../../../server/pro-setup";

export default function ProSetupScreen({enabled}: {enabled: boolean}) {
  const {pubkey, cities} = useDashboard();
  // Remount on account changes so private setup responses never cross login boundaries.
  return <ProSetupForm key={pubkey} enabled={enabled} actor={pubkey} cities={cities}/>;
}
function ProSetupForm({enabled, actor, cities}: {enabled: boolean; actor: string; cities: Array<{id: string; name: string}>}) {
  const [cityId, setCityId] = useState(""), [preview, setPreview] = useState<ProSetupPreview | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const inFlight = useRef(false);
  async function prepare() {
    if (!cityId || !actor || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(""); setPreview(null);
    try {
      const command = {action: "preview" as const, cityId}, origin = window.location.origin;
      const event = await signWithBrowserExtension(proSetupTemplate(command, origin));
      if (event.pubkey !== actor || JSON.stringify(authorizeProSetup(event, origin)) !== JSON.stringify(command)) {
        throw new Error("Your signer changed the setup request. Reconnect and try again.");
      }
      const response = await fetch("/api/pro-setup", {method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({event}), signal: AbortSignal.timeout(60_000)});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Pro setup could not be prepared.");
      setPreview(body.preview);
    } catch (error) {setMessage(error instanceof Error ? error.message : "Preparation failed; no account or payment was changed.");}
    finally {inFlight.current = false; setBusy(false);}
  }
  return <section>
    <h1>Pro city account setup</h1>
    <p>Your personal account remains your dashboard login. Your city will have its own public BitcoinWalk identity.</p>
    {!enabled ? <p role="status">This setup is being prepared and is not available yet. Your Pro payment remains recorded; do not pay again.</p> : <>
      <p><strong>Preparation preview only.</strong> This screen does not activate a city identity, Lightning address or payout split.</p>
      <CityFinder label="Your city" placeholder="Search your cities…" value={cityId} disabled={busy} items={cities}
        onChange={id => {setCityId(id); setPreview(null); setMessage("");}}/>
      <button type="button" onClick={() => void prepare()} disabled={busy || !cityId || !actor}>{busy ? "Preparing…" : "Verify and preview Pro setup"}</button>
      <p><small>Your signer confirms a private, read-only request. It is not published to Nostr.</small></p>
      {message && <p role="alert">{message}</p>}
      {preview && <section aria-label="Prepared city profile">
        <h2>{preview.profile.display_name}</h2>
        <Image unoptimized src={preview.profile.banner} alt={`${preview.cityName} profile banner`} width={1500} height={500} style={{width: "100%", maxWidth: 750, height: "auto"}}/>
        <p><Image unoptimized src={preview.profile.picture} alt={`${preview.cityName} BitcoinWalk avatar`} width={128} height={128} style={{borderRadius: "50%"}}/></p>
        <p>Website: <a href={preview.profile.website}>{preview.profile.website}</a></p>
        <ol>{preview.steps.map(step => <li key={step.label}><strong>{step.state === "ready" ? "✓" : "Pending"} {step.label}</strong><p>{step.detail}</p></li>)}</ol>
        <p>You can return to this screen without paying again. City keys and personal payout details have not been created or stored.</p>
      </section>}
    </>}
  </section>;
}
