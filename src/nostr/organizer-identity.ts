import { verifyEvent, type EventTemplate, type VerifiedEvent } from "nostr-tools";
import { getBrowserExtensionPubkey, signWithBrowserExtension } from "./signer";

export function validOrganizerKey(key: string): string {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("The signer did not return a valid public key.");
  return key;
}

/** Bind both proposal and relay-auth signatures to the identity explicitly connected on /start. */
export async function signForOrganizer(template: EventTemplate, expectedKey: string): Promise<VerifiedEvent> {
  validOrganizerKey(expectedKey);
  if (await getBrowserExtensionPubkey() !== expectedKey) throw new Error("Your signer account changed. Reconnect your chosen identity before submitting.");
  const expected = JSON.stringify([template.kind, template.created_at, template.tags, template.content]);
  const signed = await signWithBrowserExtension(structuredClone(template));
  if (signed.pubkey !== expectedKey || !verifyEvent(signed) ||
      JSON.stringify([signed.kind, signed.created_at, signed.tags, signed.content]) !== expected) {
    throw new Error("The signer returned a different identity, changed event, or invalid signature. Nothing was published.");
  }
  if (await getBrowserExtensionPubkey() !== expectedKey) throw new Error("Your signer account changed during signing. Reconnect before trying again.");
  return signed;
}
