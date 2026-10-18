import { verifyEvent, type Event, type EventTemplate, type VerifiedEvent } from "nostr-tools";

export type NostrBrowserExtension = {
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
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
let dashboardIdentity:string|null=null;
let identityGeneration=0;
let dashboardAuthorizationCurrent=true;
const dashboardAuthorizationScopes=new Map<string,boolean>();
export function setDashboardSigningIdentity(pubkey:string|null){dashboardIdentity=pubkey;dashboardAuthorizationScopes.clear();dashboardAuthorizationCurrent=true;identityGeneration++;}
/** Prevent dashboard writes while the shell is showing retained, stale authorization data. */
export function setDashboardAuthorizationCurrent(current:boolean){setDashboardAuthorizationScope("shell",current);}
export function setDashboardAuthorizationScope(scope:string,current:boolean){
 const previous=dashboardAuthorizationCurrent;
 dashboardAuthorizationScopes.set(scope,current);
 dashboardAuthorizationCurrent=[...dashboardAuthorizationScopes.values()].every(Boolean);
 if(previous!==dashboardAuthorizationCurrent)identityGeneration++;
}
export function clearDashboardAuthorizationScope(scope:string){
 const previous=dashboardAuthorizationCurrent;
 dashboardAuthorizationScopes.delete(scope);
 dashboardAuthorizationCurrent=[...dashboardAuthorizationScopes.values()].every(Boolean);
 if(previous!==dashboardAuthorizationCurrent)identityGeneration++;
}
export async function signWithBrowserExtension(template: EventTemplate,{allowStaleAuthorization=false}:{allowStaleAuthorization?:boolean}={}): Promise<Event> {
  if (typeof window === "undefined" || !window.nostr) throw new SignerUnavailableError();
  const expected=dashboardIdentity,generation=identityGeneration;
  if(expected&&!dashboardAuthorizationCurrent&&!allowStaleAuthorization)throw new Error("Dashboard data is out of date. Retry the data check before signing a change.");
  if(expected&&await window.nostr.getPublicKey()!==expected)throw new Error("Signer identity changed. Reconnect the dashboard before signing.");
  const signed=await window.nostr.signEvent(template);
  if(expected&&(identityGeneration!==generation||signed.pubkey!==expected||await window.nostr.getPublicKey()!==expected))throw new Error("Dashboard identity changed while signing. Nothing should be published; reconnect and retry.");
  return signed;
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

/** Decrypts only in the connected signer and keeps private key material out of BitcoinWalk. */
export async function decryptWithBrowserExtension(pubkey:string,ciphertext:string,expectedKey:string):Promise<string>{
  if(typeof window==="undefined"||!window.nostr?.nip44?.decrypt)throw new Error("Your connected signer needs NIP-44 decryption support to open private messages.");
  if(!/^[0-9a-f]{64}$/.test(pubkey)||!ciphertext)throw new Error("The private message envelope is invalid.");
  if(await window.nostr.getPublicKey()!==expectedKey)throw new Error("Your signer account changed. Reconnect the dashboard to open private messages.");
  const plaintext=await window.nostr.nip44.decrypt(pubkey,ciphertext);
  if(await window.nostr.getPublicKey()!==expectedKey)throw new Error("Your signer account changed while opening private messages. Reconnect and retry.");
  return plaintext;
}
