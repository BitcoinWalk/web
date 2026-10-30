import { compareEvents, finalizeEvent, getPublicKey, nip19, verifyEvent, type Event, type EventTemplate } from "nostr-tools";
import { wrapEvent } from "nostr-tools/nip59";
import { z } from "zod";
import { SUPER_ADMIN_PUBKEY } from "../nostr/authority";
import { type CityRevision } from "../nostr/city-records";

export const guideProfile = {
  name: "BitcoinWalk Guide",
  display_name: "BitcoinWalk Guide",
  picture: "https://bitcoinwalk.org/brand/bitcoinwalk-admin-favicon.png",
  nip05: "guide@bitcoinwalk.org",
  lud16: "guide@bitcoinwalk.org",
  website: "https://bitcoinwalk.org/",
  bot: true,
  about: "BitcoinWalk’s automated assistant for walk notifications and organizer help. Notification-only pilot; replies are not monitored. Never send private keys or payment credentials.",
};
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
  proSetupAdminURL:z.string().url().refine(value=>{const u=new URL(value);return u.protocol==="https:"&&["bitcoinwalk.org","app-staging.bitcoinwalk.org"].includes(u.hostname)&&["/admin/my-cities","/admin/upgrade"].includes(u.pathname)&&!u.port&&!u.search&&!u.hash&&!u.username&&!u.password;}).optional(),
  organizerChatStatusURL:z.string().url().refine(value=>{const u=new URL(value);return (u.href==="http://127.0.0.1:3345/api/organizer-chat-invitations"||u.href==="http://127.0.0.1:3338/api/organizer-chat-invitations")&&!u.username&&!u.password&&!u.hash&&!u.search;}).optional(),
  organizerChatURL:z.string().url().refine(value=>{const u=new URL(value);return u.protocol==="https:"&&["bitcoinwalk.org","app-staging.bitcoinwalk.org"].includes(u.hostname)&&u.pathname==="/chat/hosts"&&!u.search&&!u.hash&&!u.port&&!u.username&&!u.password;}).optional(),
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
  return `Welcome to BitcoinWalk in ${city}! 🟠\n\nYour Basic city is live.\n\nCity page: ${origin}/${encodeURIComponent(revision.city.slug)}\nFirst walk: ${origin}/${encodeURIComponent(revision.city.slug)}/${nevent}\nAdd or check your next walk: ${origin}/admin/walks\nExplore Pro: ${origin}/admin/my-cities\n\nShare the city page with your community and keep its next walk up to date. Pro adds a dedicated city identity and host-invited sponsorships.\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
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

export type ProSetupAlertState="setup-required"|"payout-confirmed"|"signer-confirmed"|"ready-for-proof"|"awaiting-review"|"awaiting-publication"|"active"|"complete";
export function proSetupAlert(cityName:string,cityId:string,state:ProSetupAlertState,adminURL:string):string{
 const city=cityName.replace(/[\p{C}\p{Z}]+/gu," ").trim(),url=new URL(adminURL);url.searchParams.set("city",cityId);if(url.pathname==="/admin/my-cities")url.hash="pro-city-services";
 if(state==="active"){url.pathname="/admin/profile";url.hash="city-profile";}
 const footer=`\n\nOpen the current status: ${url.href}\nProcedure: https://docs.bitcoinwalk.org/hosts/complete-city-setup/\n\nYour payment is already recorded. Do not pay again. Never share a private key, seed phrase, bunker secret or recovery file.\n\nBitcoinWalk Guide is automated; replies are not monitored. The dashboard is authoritative if the state has changed.`;
 if(state==="setup-required")return `Next step for BitcoinWalk in ${city}: confirm your payout destination.\n\nConnect the personal Nostr account that already manages the city, verify the prepared profile, then confirm your private Lightning address or LNURL-pay destination.${footer}`;
 if(state==="payout-confirmed")return `Next step for BitcoinWalk in ${city}: choose the city signer.\n\nCreate or reconnect a recoverable identity for the public city account. If your connected owner npub is already publicly named BitcoinWalk in ${city}, you can use the verified skip option instead of creating another signer. Confirm recovery and verify the exact npub before saving it.${footer}`;
 if(state==="signer-confirmed")return `Next step for BitcoinWalk in ${city}: confirm your payout destination.\n\nThe city signer is saved. Reconnect the personal host account and confirm the private Lightning address or LNURL-pay destination for your organizer share.${footer}`;
 if(state==="ready-for-proof")return `Next step for BitcoinWalk in ${city}: sign the private activation request.\n\nReconnect the exact saved city signer, verify its npub, then submit both the host authorization and city-signer proof.${footer}`;
 if(state==="awaiting-review")return `BitcoinWalk in ${city}: activation proofs were submitted.\n\nNo organizer action is needed now. BitcoinWalk must review the exact private proofs. Do not create another city identity or repeat completed signatures.${footer}`;
 if(state==="awaiting-publication")return `BitcoinWalk in ${city}: the city identity was approved.\n\nNo organizer action is needed now. BitcoinWalk must publish the approved binding and verify exact relay read-back.${footer}`;
 if(state==="complete")return `Welcome to BitcoinWalk Pro in ${city}! 🟠\n\nYour public city identity, NIP-05 and Lightning address are active.\n\nAdd or check your next walk: ${url.origin}/admin/walks\nInvite a sponsor: ${url.origin}/admin/sponsor\n\nWhen a sponsor accepts an invitation created by the city host and pays, 79% is reserved for the host and BitcoinWalk retains 21%. Invitations created by the super-admin do not include a host payout.\n\nKeep the city signer recovery method safe. BitcoinWalk will never ask for a private key, seed phrase, bunker secret or recovery file.\n\nBitcoinWalk Guide is automated; replies are not monitored.`;
 return `Next step for BitcoinWalk in ${city}: publish the verified city profile.\n\nYour city identity binding is active. Open Profile in BitcoinWalk, check your verified NIP-05 and public Lightning address, then reconnect the saved city signer and select Publish verified city profile. No Primal or Damus profile editor is needed. Your name, avatar, banner and bio stay unchanged.\n\nZaps sent to your public BitcoinWalk Lightning address are split 79% to your saved organizer payout wallet and 21% to BitcoinWalk. Zaps sent directly to another wallet address bypass this split. Publishing sends no funds and does not change your private payout destination.${footer}`;
}

export function payoutUpdateAlert(cityName:string,cityId:string,state:"pending"|"active"|"attention",adminURL:string):string{
 const city=cityName.replace(/[\p{C}\p{Z}]+/gu," ").trim(),url=new URL(adminURL);url.searchParams.set("city",cityId);
 if(state==="active")return `Your new payout destination for BitcoinWalk in ${city} is now active! ⚡\n\nPayments will now be sent to your new destination. Everything is set up, so there’s nothing else you need to do.\n\nThis is an automated message from BitcoinWalk Guide. Replies aren’t monitored.`;
 if(state==="attention")return `Your payout destination update for BitcoinWalk in ${city} needs attention.\n\nThe previous destination is still active; no funds were redirected to an unverified replacement.\n\nReview the update: ${url.href}\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
 return `Your payout destination update for BitcoinWalk in ${city} was saved.\n\nThe previous destination remains active while BitcoinWalk verifies the replacement.\n\nTrack the update: ${url.href}\n\nBitcoinWalk Guide is automated; replies are not monitored. Never share your private key.`;
}

export function organizerChatInvitation(cityNames:string[],chatURL:string):string{
 const cities=cityNames.map(value=>value.replace(/[\p{C}\p{Z}]+/gu," ").trim()).filter(Boolean).join(", ");
 return `You’re invited to BitcoinWalk Hosts.\n\nThis private group connects the current verified hosts of BitcoinWalk cities. Your access follows your city ownership${cities?` (${cities})`:""}; it is removed automatically after an ownership transfer.\n\nOpen the Hosts chat: ${chatURL}\n\nThe room uses NIP-29 and is not end-to-end encrypted. Never share private keys, recovery files or payout credentials. BitcoinWalk Guide is automated; replies are not monitored.`;
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
