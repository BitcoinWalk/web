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
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [destination, setDestination] = useState("");
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
      setPreview(body.preview); setDestination(body.preview.payout.destination ?? body.preview.payout.suggestedDestination ?? "");
    } catch (error) {setMessage(error instanceof Error ? error.message : "Preparation failed; no account or payment was changed.");}
    finally {inFlight.current = false; setBusy(false);}
  }
  async function savePayout() {
    if (!preview || !destination.trim() || !actor || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const command = {action: "save-payout" as const, cityId: preview.cityId, destination: destination.trim()}, origin = window.location.origin;
      const event = await signWithBrowserExtension(proSetupTemplate(command, origin));
      if (event.pubkey !== actor || JSON.stringify(authorizeProSetup(event, origin)) !== JSON.stringify(command)) throw new Error("Your signer changed the payout request. Reconnect and try again.");
      const response = await fetch("/api/pro-setup", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({event}), signal: AbortSignal.timeout(60_000)});
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Payout destination could not be saved.");
      setPreview(value => value ? {...value, payout: {configured: true, destination: body.payout.destination, version: body.payout.version},
        steps: value.steps.map(step => step.label === "Personal payout destination" ? {...step, state: "ready", detail: `Owner-confirmed destination version ${body.payout.version} is saved privately. It is not active until provisioning is verified.`} : step)} : value);
      setDestination(body.payout.destination); setMessage(body.payout.message);
    } catch (error) {setMessage(error instanceof Error ? error.message : "Destination was not saved.");}
    finally {inFlight.current = false; setBusy(false);}
  }
  return <section>
    <h1>Pro city account setup</h1>
    <p>Your personal account remains your dashboard login. Your city will have its own public BitcoinWalk identity.</p>
    {!enabled ? <p role="status">This setup is being prepared and is not available yet. Your Pro payment remains recorded; do not pay again.</p> : <>
      <p><strong>Preparation preview only.</strong> This screen does not activate a city identity, Lightning address or payout split.</p>
      <CityFinder label="Your city" placeholder="Search your cities…" value={cityId} disabled={busy} items={cities}
        onChange={id => {setCityId(id); setPreview(null); setDestination(""); setMessage("");}}/>
      <button type="button" onClick={() => void prepare()} disabled={busy || !cityId || !actor}>{busy ? "Preparing…" : "Verify and preview Pro setup"}</button>
      <p><small>Your signer confirms a private, read-only request. It is not published to Nostr.</small></p>
      {message && <p role="alert">{message}</p>}
      {preview && <section aria-label="Prepared city profile">
        <h2>{preview.profile.display_name}</h2>
        <Image unoptimized src={preview.profile.banner} alt={`${preview.cityName} profile banner`} width={1500} height={500} style={{width: "100%", maxWidth: 750, height: "auto"}}/>
        <p><Image unoptimized src={preview.profile.picture} alt={`${preview.cityName} BitcoinWalk avatar`} width={128} height={128} style={{borderRadius: "50%"}}/></p>
        <p>Website: <a href={preview.profile.website}>{preview.profile.website}</a></p>
        <fieldset disabled={busy}>
          <legend>Personal payout destination</legend>
          <label>Lightning address or LNURL-pay
            <input value={destination} onChange={event => setDestination(event.target.value)} placeholder="you@example.com or lnurl1…" autoComplete="off" spellCheck={false}/>
          </label>
          <p>79% of payments to your city’s BitcoinWalk Lightning address will go to this private destination. BitcoinWalk retains 21%. Saving validates the endpoint but sends no payment.</p>
          {!preview.payout.configured && preview.payout.suggestedDestination && <p><strong>Recovered from your Pro checkout:</strong> {preview.payout.suggestedDestination}. Confirm it below with the current city owner’s signer; checkout alone cannot activate it.</p>}
          {preview.payout.configured && <p>Saved destination version {preview.payout.version}: <strong>{preview.payout.destination}</strong>. Confirming a change creates a new version; existing invoices retain their previous version.</p>}
          <button type="button" onClick={() => void savePayout()} disabled={busy || !destination.trim()}>{busy ? "Validating…" : preview.payout.configured ? "Validate and save new version" : "Validate and save destination"}</button>
        </fieldset>
        <ol>{preview.steps.map(step => <li key={step.label}><strong>{step.state === "ready" ? "✓" : "Pending"} {step.label}</strong><p>{step.detail}</p></li>)}</ol>
        <p>You can return to this screen without paying again. A saved payout destination remains private and inactive until provisioning succeeds. No city key has been created or stored.</p>
      </section>}
    </>}
  </section>;
}
