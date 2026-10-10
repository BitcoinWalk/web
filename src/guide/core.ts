import { compareEvents, finalizeEvent, getPublicKey, nip19, verifyEvent, type Event, type EventTemplate } from "nostr-tools";
import { wrapEvent } from "nostr-tools/nip59";
import { z } from "zod";
import { SUPER_ADMIN_PUBKEY } from "../nostr/authority";
import { type CityRevision } from "../nostr/city-records";

export const guideProfile = { name: "bitcoinwalk-guide", display_name: "BitcoinWalk Guide", bot: true,
  about: "BitcoinWalk’s automated assistant for walk notifications and organizer help. Notification-only pilot; replies are not monitored. Never send private keys or payment credentials." };
// NIP-05 is intentionally absent until the domain actually verifies this key.
const key = z.string().regex(/^[0-9a-f]{64}$/);
const relayURL = z.string().url().refine(value => {
  const u = new URL(value);
  return u.protocol === "wss:" && !u.username && !u.password && !u.hash && !u.search && !u.port
    && u.hostname.includes(".") && !/^[\d.]+$/.test(u.hostname) && !u.hostname.includes(":")
    && !/(?:^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname);
}, "Use a public WSS hostname without credentials, port or query.").transform(value => new URL(value).href);
export const configSchema = z.object({
  sourceRelay: relayURL,
  // A Guide running beside the relay may read its private listener when the
  // host cannot hairpin through the public TLS endpoint. Public links and the
  // durable outbox identity always remain bound to sourceRelay above.
  sourceReadRelay:z.string().url().refine(value=>new URL(value).href==="ws://127.0.0.1:3334/","Use the exact reviewed relay loopback listener.").optional(),
  discoveryRelays: z.array(relayURL).min(1).max(5),
  // Operator-reviewed destinations only; discovery never authorizes arbitrary outbound hosts.
  allowedInboxRelays: z.array(relayURL).min(1).max(10),
  recipients: z.array(key).min(1).max(10),
  adminURL: z.string().url().refine(value => {
    const u = new URL(value);
    return u.protocol === "https:" && ["app-staging.bitcoinwalk.org", "bitcoinwalk.org"].includes(u.hostname)
      && u.pathname === "/admin" && !u.port && !u.search && !u.hash && !u.username && !u.password;
  }),
  directoryStatusURL:z.string().url().refine(value=>{const u=new URL(value);return (u.href==="http://127.0.0.1:3345/api/directory-notifications"||u.href==="http://127.0.0.1:3338/api/directory-notifications")&&!u.username&&!u.password&&!u.hash&&!u.search;}).optional(),
  directoryAdminURL:z.string().url().refine(value=>new URL(value).href==="https://bitcoinwalk.org/admin").optional(),
  proSetupStatusURL:z.string().url().refine(value=>{const u=new URL(value);return (u.href==="http://127.0.0.1:3345/api/pro-setup-notifications"||u.href==="http://127.0.0.1:3338/api/pro-setup-notifications")&&!u.username&&!u.password&&!u.hash&&!u.search;}).optional(),
  proSetupAdminURL:z.string().url().refine(value=>{const u=new URL(value);return u.protocol==="https:"&&["bitcoinwalk.org","app-staging.bitcoinwalk.org"].includes(u.hostname)&&u.pathname==="/admin/upgrade"&&!u.port&&!u.search&&!u.hash&&!u.username&&!u.password;}).optional(),
  enabled: z.boolean().default(false),
});
export type GuideConfig = z.infer<typeof configSchema>;

export function assertBotKey(secret: Uint8Array, recipients: string[]): string {
  const pubkey = getPublicKey(secret);
  if (pubkey === SUPER_ADMIN_PUBKEY || recipients.includes(pubkey)) throw new Error("Guide must use a separate notification-only key, not an admin or recipient key.");
  return pubkey;
}

export function signTransportAuth(template: EventTemplate, secret: Uint8Array, allowedRelays: string[]) {
  const relay = template.tags.filter(t => t[0] === "relay");
  const challenge = template.tags.filter(t => t[0] === "challenge");
  if (template.kind !== 22242 || template.content !== "" || relay.length !== 1 || challenge.length !== 1
    || !challenge[0][1] || !allowedRelays.includes(new URL(relay[0][1]).href)
    || Math.abs(template.created_at - Math.floor(Date.now()/1000)) > 60) throw new Error("Unexpected transport authentication request.");
  return finalizeEvent(template, secret);
}

export function approvalAlert(revision: CityRevision, adminURL: string): string {
  // Plain text only: don't interpolate organizer-controlled links or line breaks.
  const city = revision.city.cityName.replace(/[\p{C}\p{Z}]+/gu, " ").trim();
  const tier = revision.city.requestedTier === "paid" ? "Pro requested — payment not verified" : revision.city.requestedTier === "free" ? "Basic" : "Not specified";
  return `New BitcoinWalk submission awaiting review\nCity: ${city}\nOrganizer: ${nip19.npubEncode(revision.event.pubkey)}\nRequested plan: ${tier}\nCity ID: ${revision.city.cityId}\nSubmission: ${revision.event.id}\n\nReview: ${adminURL}#submission-${revision.event.id}\n\nConnect your super-admin signer and load submissions. Status may have changed since this alert. Approve only in BitcoinWalk, never by replying here. BitcoinWalk Guide is automated; replies are not monitored.`;
}

export function liveAlert(revision: CityRevision, event: Event, adminURL: string, relay: string): string {
  const city = revision.city.cityName.replace(/[\p{C}\p{Z}]+/gu, " ").trim();
  const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey, kind: 31923, relays: [relay] });
  const origin = new URL(adminURL).origin;
  return `Your BitcoinWalk in ${city} is live!\n\nOpen your walk: ${origin}/${encodeURIComponent(revision.city.slug)}/${nevent}\nManage this city and add future walks: ${origin}/admin/walks\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
}

export function replicationAlert(state:"degraded"|"recovered",cityName:string,cityId:string):string {
  const city=cityName.replace(/[\p{C}\p{Z}]+/gu," ").trim();
  if(state==="degraded")return `BitcoinWalk replication is delayed for ${city}.\nCity ID: ${cityId}\n\nYour public walk remains on the shared relay while BitcoinWalk retries the city replica. Do not republish or sign duplicate events. We will send another message after replication recovers.\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
  return `BitcoinWalk replication has recovered for ${city}.\nCity ID: ${cityId}\n\nThe city replica is healthy again. No organizer action is required.\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
}

export function directoryAlert(purpose:"directory-invitation"|"directory-active"|"directory-failed",cityName:string,requestId:string,adminURL:string):string{
 const city=cityName.replace(/[\p{C}\p{Z}]+/gu," ").trim(),link=`${new URL(adminURL).origin}/admin/directory?request=${requestId}`;
 if(purpose==="directory-invitation")return `BitcoinWalk directory signature requested for ${city}.\n\nReview the city relay endpoint and authorities, add your separate offline recovery npub, then sign the exact request: ${link}\n\nOpening the link grants no authority. Sign only after every field matches what you agreed with BitcoinWalk. Never share a private key.`;
 if(purpose==="directory-active")return `The BitcoinWalk directory entry for ${city} is active.\n\nBoth independent directory transports returned the exact owner-signed event. No further organizer action is required.\n\nBitcoinWalk Guide is automated; replies are not monitored.`;
 return `The BitcoinWalk directory activation for ${city} did not complete.\n\nYour owner signature remains unchanged and no replacement event was created. BitcoinWalk will review the transport failure and retry the exact event; do not sign a duplicate request.\n\nBitcoinWalk Guide is automated; replies are not monitored.`;
}

export function proSetupAlert(cityName:string,cityId:string,adminURL:string):string{
 const city=cityName.replace(/[\p{C}\p{Z}]+/gu," ").trim(),url=new URL(adminURL);url.searchParams.set("city",cityId);
 return `Your BitcoinWalk in ${city} is ready for Pro setup.\n\nComplete or resume the city identity, payout and public profile setup: ${url.href}\n\nYour payment is already recorded. Do not pay again. BitcoinWalk never asks for your private key; keep the city signer recovery method safe.\n\nBitcoinWalk Guide is automated; replies are not monitored.`;
}

export function payoutUpdateAlert(cityName:string,cityId:string,state:"pending"|"active"|"attention",adminURL:string):string{
 const city=cityName.replace(/[\p{C}\p{Z}]+/gu," ").trim(),url=new URL(adminURL);url.searchParams.set("city",cityId);
 if(state==="active")return `Your new payout destination for BitcoinWalk in ${city} is active.\n\nThe previous destination stayed active until the replacement passed provider and public read-back. No further action is required.\n\nBitcoinWalk Guide is automated; replies are not monitored.`;
 if(state==="attention")return `Your payout destination update for BitcoinWalk in ${city} needs attention.\n\nThe previous destination is still active; no funds were redirected to an unverified replacement. Review the update here: ${url.href}\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
 return `Your payout destination update for BitcoinWalk in ${city} was saved.\n\nThe previous destination remains active while BitcoinWalk verifies the replacement. You can follow its status here: ${url.href}\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
}

export function selectInbox(events: Event[], recipient: string, allowed: string[], now = Math.floor(Date.now()/1000)): string[] {
  const latest = events.filter(e => e.kind === 10050 && e.pubkey === recipient && e.created_at <= now + 60 && verifyEvent(e)).sort(compareEvents)[0];
  if (!latest) throw new Error("Recipient has no verified NIP-17 inbox list.");
  const destinations = [...new Set(latest.tags.filter(t => t[0] === "relay").flatMap(t => {
    const result = relayURL.safeParse(t[1]); return result.success ? [result.data] : [];
  }))];
  const approved = destinations.filter(url => allowed.includes(url));
  if (!approved.length) throw new Error("Recipient inbox requires operator review; no allowed destination found.");
  return approved.slice(0, 3);
}

export function wrapAlert(content: string, recipient: string, secret: Uint8Array): { recipient: Event; sender: Event } {
  const rumor = { kind: 14, created_at: Math.floor(Date.now()/1000), tags: [["p", recipient]], content };
  return { recipient: wrapEvent(rumor, secret, recipient), sender: wrapEvent(rumor, secret, getPublicKey(secret)) };
}
