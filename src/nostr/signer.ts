import { verifyEvent, type Event, type EventTemplate, type VerifiedEvent } from "nostr-tools";

export type NostrBrowserExtension = {
  nip44?: { encrypt(pubkey: string, plaintext: string): Promise<string> };
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<Event>;
};

declare global {
  interface Window {
    nostr?: NostrBrowserExtension;
  }
}

export class SignerUnavailableError extends Error {
  constructor() {
    super("A Nostr browser extension is required to sign this event.");
    this.name = "SignerUnavailableError";
  }
}

/** Signs only in the user's extension; no private key is handled by BitcoinWalk. */
export async function signWithBrowserExtension(template: EventTemplate): Promise<Event> {
  if (typeof window === "undefined" || !window.nostr) throw new SignerUnavailableError();
  return window.nostr.signEvent(template);
}

/** Signs a NIP-42 relay authentication challenge inside the user's extension. */
export async function authenticateWithBrowserExtension(template: EventTemplate): Promise<VerifiedEvent> {
  const event = await signWithBrowserExtension(template);
  if (!verifyEvent(event)) throw new Error("The browser extension returned an invalid relay authentication event.");
  return event;
}

export async function getBrowserExtensionPubkey(): Promise<string> {
  if (typeof window === "undefined" || !window.nostr) throw new SignerUnavailableError();
  return window.nostr.getPublicKey();
}
