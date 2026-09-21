"use client";

import { useRef, useState } from "react";
import { nip19 } from "nostr-tools";
import { getBrowserExtensionPubkey } from "../nostr/signer";
import { validOrganizerKey } from "../nostr/organizer-identity";

type Choice = "existing" | "dedicated";

export default function OrganizerIdentity({ disabled, onIdentityChange }: {
  disabled: boolean; onIdentityChange: (key: string | null) => void;
}) {
  const [choice, setChoice] = useState<Choice>("existing");
  const [backedUp, setBackedUp] = useState(false);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const connecting = useRef(false);

  function clearIdentity() {
    setPubkey(null);
    onIdentityChange(null);
    setMessage("");
  }

  async function connect() {
    if (connecting.current || disabled || (choice === "dedicated" && !backedUp)) return;
    connecting.current = true;
    setBusy(true);
    clearIdentity();
    try {
      const key = validOrganizerKey(await getBrowserExtensionPubkey());
      setPubkey(key);
      onIdentityChange(key);
      setMessage("Identity connected. Check the npub below before submitting. Connecting does not publish anything or rename your profile.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not connect your signer.");
    } finally {
      connecting.current = false;
      setBusy(false);
    }
  }

  return <section aria-labelledby="organizer-identity-heading">
    <h2 id="organizer-identity-heading">Choose your organizer identity</h2>
    <p>You can keep your personal account unchanged, or use a separate city account.</p>
    <fieldset disabled={disabled || busy}>
      <legend>Nostr account</legend>
      <label><input type="radio" name="identity-choice" checked={choice === "existing"} onChange={() => { setChoice("existing"); clearIdentity(); }} /> Use an existing Nostr identity</label>
      <label><input type="radio" name="identity-choice" checked={choice === "dedicated"} onChange={() => { setChoice("dedicated"); clearIdentity(); }} /> Set up a separate BitcoinWalk city identity</label>
      {choice === "existing" ? <p>Select your existing account in your signer, then connect below. Registration does not change your name, picture, followers or profile.</p> : <>
        <ol>
          <li>In your Nostr signer, create a new identity (a new key pair), or select a dedicated city identity you already own.</li>
          <li>Back up its private key securely using the signer&apos;s backup feature. BitcoinWalk cannot recover it for you.</li>
          <li>Select that city identity in the signer, then connect below. A separate account keeps your personal profile separate, but does not guarantee anonymity.</li>
        </ol>
        <label><input type="checkbox" checked={backedUp} onChange={(event) => { setBackedUp(event.target.checked); clearIdentity(); }} /> I have selected my dedicated identity and securely backed up its key.</label>
      </>}
      <p>New to Nostr? Your <strong>npub</strong> is your public account identifier. Your <strong>nsec</strong> is secret. Create keys in a Nostr browser-extension signer; never paste an nsec into BitcoinWalk. This registration flow currently requires a browser extension; remote/mobile signer support is planned.</p>
      <button type="button" onClick={connect} disabled={choice === "dedicated" && !backedUp}>{busy ? "Connecting…" : pubkey ? "Reconnect / change account" : "Connect selected signer identity"}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
    {pubkey && <p style={{ overflowWrap: "anywhere" }}>Connected npub: <code>{nip19.npubEncode(pubkey)}</code></p>}
    <details>
      <summary>Can I call my account “BitcoinWalk in [City]”?</summary>
      <p>Yes. Edit the profile of your chosen identity in your Nostr client as a separate action. You must control its signing key; knowing an npub is not enough. If you rename an existing personal identity, that name changes for the same account across Nostr—not just BitcoinWalk. Create a separate identity if you want to keep your personal profile unchanged.</p>
      <p>BitcoinWalk does not automatically rename accounts or publish profile changes.</p>
    </details>
  </section>;
}
