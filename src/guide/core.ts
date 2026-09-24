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
  discoveryRelays: z.array(relayURL).min(1).max(5),
  // Operator-reviewed destinations only; discovery never authorizes arbitrary outbound hosts.
  allowedInboxRelays: z.array(relayURL).min(1).max(10),
  recipients: z.array(key).min(1).max(10),
  adminURL: z.string().url().refine(value => {
    const u = new URL(value);
    return u.protocol === "https:" && ["app-staging.bitcoinwalk.org", "bitcoinwalk.org"].includes(u.hostname)
      && u.pathname === "/admin" && !u.port && !u.search && !u.hash && !u.username && !u.password;
  }),
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
  const tier = revision.city.requestedTier === "paid" ? "Paid requested — payment not verified" : revision.city.requestedTier === "free" ? "Free" : "Not specified";
  return `New BitcoinWalk submission awaiting review\nCity: ${city}\nOrganizer: ${nip19.npubEncode(revision.event.pubkey)}\nRequested plan: ${tier}\nCity ID: ${revision.city.cityId}\nSubmission: ${revision.event.id}\n\nReview: ${adminURL}#submission-${revision.event.id}\n\nConnect your super-admin signer and load submissions. Status may have changed since this alert. Approve only in BitcoinWalk, never by replying here. BitcoinWalk Guide is automated; replies are not monitored.`;
}

export function liveAlert(revision: CityRevision, event: Event, adminURL: string, relay: string): string {
  const city = revision.city.cityName.replace(/[\p{C}\p{Z}]+/gu, " ").trim();
  const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey, kind: 31923, relays: [relay] });
  const origin = new URL(adminURL).origin;
  return `Your BitcoinWalk in ${city} is live!\n\nOpen your walk: ${origin}/${encodeURIComponent(revision.city.slug)}/${nevent}\nManage this city and add future walks: ${origin}/admin/walks\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
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
