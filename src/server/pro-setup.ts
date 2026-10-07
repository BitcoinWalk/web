import type {Event} from "nostr-tools";
import type {CityBrandAuthority} from "../nostr/city-brand";
import {queryAuthorizations, queryDirectoryRecords, queryRelayEvents} from "../nostr/city-records";
import {CITY_DIRECTORY_KIND, discoverCityDirectoryChainForSigning, discoverExistingCityDirectoryRoot} from "../nostr/city-directory";
import {latestEventModerations, organizerPublishingStatus, queryEventModerations} from "../nostr/event-moderation";
import {managedCities} from "../nostr/moderation";
import {serverReadRelays} from "../lib/server-relay-config";
import {relayConfig} from "../lib/relay-config";
import {getPaymentRuntime} from "../payments/runtime";
import {getLogoCatalog} from "../logos/runtime";
import {ProfileArtworkStore} from "../logos/profile-artwork";
import {managedBackground} from "./share-image";
import {PayoutDestinationStore} from "../payments/payout-destination-store";
import {ProSetupTaskStore} from "../payments/pro-setup-task-store";
import {validatePayoutDestination} from "./lnurl-pay";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {authorizeCitySignerProof, type ProSetupCommand} from "../nostr/pro-setup-command";

/** This preflight cannot publish, create invoices, assign identities or activate payments. */
export type ProSetupPreview = {
  cityId: string; cityName: string; revisionId: string;
  profile: {name: string; display_name: string; picture: string; banner: string; website: string};
  status: "preparation-only";
  payout: {configured: boolean; destination?: string; version?: number; suggestedDestination?: string; registrationVersion?: number};
  setup: {state: "setup-required" | "payout-confirmed" | "signer-confirmed" | "ready-for-proof"; updatedAt: number};
  signer: {configured: boolean; pubkey?: string; version?: number};
  steps: Array<{label: string; state: "ready" | "blocked"; detail: string}>;
};

// Dependencies stay explicit so incomplete reads and owner changes can be tested without networking.
export const proSetupDependencies = {
  snapshot: () => queryDirectoryRecords(serverReadRelays()),
  grants: () => queryAuthorizations(serverReadRelays()),
  discover: async (cityId: string, creator: string) => {
    const read = async (relay: string, id: string): Promise<Event[]> => {
      const events = await queryRelayEvents([relay], [CITY_DIRECTORY_KIND], undefined, {"#i": [id], limit: 500});
      if (events.length >= 500) throw new Error("City directory history is incomplete.");
      return events;
    };
    const discovery = await discoverExistingCityDirectoryRoot(relayConfig.directoryRelays, cityId, creator, read);
    if (!discovery.root) return null;
    const {state} = await discoverCityDirectoryChainForSigning(relayConfig.directoryRelays,
      {cityId, rootEventId: discovery.root.id, initialOwnerPubkey: creator}, read);
    return {ownerPubkey: state.content.ownerPubkey, eventId: state.currentEvent.id};
  },
  entitlement: (cityId: string) => getPaymentRuntime().store.db.prepare(
    "SELECT invoiceId,owner FROM paid_city_entitlement WHERE cityId=?").get(cityId) as {invoiceId: string; owner: string} | undefined,
  restrictions: async (cityId: string, owner: string) => {
    const [records, status] = await Promise.all([queryEventModerations(serverReadRelays(), cityId), organizerPublishingStatus(serverReadRelays(), owner)]);
    return status === "suspended" || latestEventModerations(records).some(row =>
      row.decision.status === "suspended" && (row.decision.scope === "city" || row.decision.scope === "author" && row.decision.target === owner));
  },
};
export async function resolveProSetupAuthority(cityId: string, actor: string, deps = proSetupDependencies) {
  const [snapshot, grants] = await Promise.all([deps.snapshot(), deps.grants()]);
  const row = managedCities(snapshot.revisions, snapshot.approvals).find(item => item.state === "approved" && item.revision.city.cityId === cityId);
  const grant = grants.find(item => item.grant.cityId === cityId);
  if (!row || !grant) throw new Error("An approved city and verified creator authorization are required.");
  // Never use the editor who authored the latest revision as owner; directory failures cannot fall back.
  const directory = await deps.discover(cityId, grant.grant.creatorPubkey);
  const ownerPubkey = directory?.ownerPubkey ?? grant.grant.creatorPubkey;
  if (actor !== ownerPubkey) throw new Error("Only the current city owner can prepare its Pro account.");
  const entitlement = deps.entitlement(cityId);
  if (!entitlement) throw new Error("A settled Pro entitlement is required. This screen never asks you to pay again.");
  if (await deps.restrictions(cityId, ownerPubkey)) throw new Error("City or organizer publishing is suspended. Contact the administrator.");
  const authority: CityBrandAuthority = {cityId, ownerPubkey, authorityEventId: directory?.eventId ?? grant.event.id,
    approvalEventId: row.decision.event.id, entitlementId: entitlement.invoiceId, eligible: true};
  return {authority, row, entitlement};
}

function ensureSetupTask(resolved: Awaited<ReturnType<typeof resolveProSetupAuthority>>) {
  const db = getPaymentRuntime().store.db;
  const binding = db.prepare(`SELECT payment_invoice.revisionId,payment_invoice_payout.destinationVersion
    FROM payment_invoice LEFT JOIN payment_invoice_payout ON payment_invoice_payout.invoiceId=payment_invoice.id WHERE payment_invoice.id=?`)
    .get(resolved.entitlement.invoiceId) as {revisionId: string; destinationVersion: number | null} | undefined;
  if (!binding) throw new Error("The settled Pro payment record is incomplete. Contact the administrator; do not pay again.");
  const store = new ProSetupTaskStore(db);
  const task = store.ensure({cityId: resolved.authority.cityId, entitlementId: resolved.entitlement.invoiceId,
    originalOwnerPubkey: resolved.entitlement.owner, currentOwnerPubkey: resolved.authority.ownerPubkey,
    ...(binding.destinationVersion === null ? {} : {registrationVersion: binding.destinationVersion})});
  return {task, store, binding};
}

let artworkStore: ProfileArtworkStore | undefined;
let artworkConfig = "";
export async function prepareProSetupPreview(cityId: string, actor: string, origin: string): Promise<ProSetupPreview> {
  const {authority, row} = await resolveProSetupAuthority(cityId, actor);
  const city = row.revision.city, slug = row.decision.approval.slug ?? city.slug;
  const catalog = getLogoCatalog();
  const pack = await catalog.ready({cityId, revisionId: row.revision.event.id, slug});
  if (!pack) throw new Error("Approved city artwork is not ready. Retry after logo generation finishes.");
  const logo = await catalog.file(pack.jobKey, `${pack.slug}-bitcoinwalk-on-black.png`);
  if (!logo) throw new Error("Approved city artwork is unavailable.");
  const hero = await managedBackground([row.decision.approval.heroImageUrl, city.heroImageUrl]);
  if (!hero) throw new Error("The approved city photo is unavailable. Restore it before preparing the profile.");
  const mediaRoot = process.env.BITCOINWALK_MEDIA_ROOT;
  if (!mediaRoot) throw new Error("Persistent profile artwork storage is not configured.");
  const config = `${mediaRoot}\n${origin}`;
  if (!artworkStore || artworkConfig !== config) {artworkStore = new ProfileArtworkStore(mediaRoot, origin); artworkConfig = config;}
  const artwork = await artworkStore.ensure({cityId, revisionId: row.revision.event.id, hero, cityLogo: logo.data});
  // A changing owner/approval/entitlement must not receive a stale prepared profile.
  const fresh = await resolveProSetupAuthority(cityId, actor);
  if (JSON.stringify(authority) !== JSON.stringify(fresh.authority)) throw new Error("City authority changed during preparation. Reload to try again.");
  const name = `BitcoinWalk in ${city.cityName}`;
  const {task: initialTask, store: taskStore, binding} = ensureSetupTask(fresh);
  const destinations = new PayoutDestinationStore(getPaymentRuntime().store.db);
  const stored = destinations.current(cityId);
  const payout = stored?.ownerPubkey === fresh.authority.ownerPubkey ? stored : null;
  const task = payout && initialTask.payoutVersion !== payout.version ?
    taskStore.confirmPayout(cityId, fresh.authority.entitlementId, fresh.authority.ownerPubkey, payout.version) : initialTask;
  const registration = !payout && task.registrationVersion ? destinations.registration(cityId, task.registrationVersion) : undefined;
  const suggestion = registration?.ownerPubkey === fresh.authority.ownerPubkey && registration.revisionId === binding.revisionId ? registration : undefined;
  return {cityId, cityName: city.cityName, revisionId: row.revision.event.id, status: "preparation-only",
    setup: {state: task.state, updatedAt: task.updatedAt},
    signer: task.signer ? {configured: true, pubkey: task.signer.pubkey, version: task.signer.version} : {configured: false},
    payout: payout ? {configured: true, destination: payout.normalized, version: payout.version} : suggestion ?
      {configured: false, suggestedDestination: suggestion.normalized, registrationVersion: suggestion.version} : {configured: false},
    profile: {name, display_name: name, picture: artwork.avatar.url, banner: artwork.banner.url, website: `${origin}/${slug}`},
    steps: [
      {label: "Pro payment and city ownership", state: "ready", detail: "Verified against current approval, ownership, moderation and settled payment records."},
      {label: "City profile artwork", state: "ready", detail: "Prepared from the approved city photo. The avatar uses the larger icon without city lettering."},
      {label: "Personal payout destination", state: payout ? "ready" : "blocked", detail: payout ? `Owner-confirmed destination version ${payout.version} is saved privately. It is not active until provisioning is verified.` : suggestion ? "Your checkout destination was recovered privately. Confirm it again with the current city owner’s signer before activation." : "Add and confirm your personal Lightning address or LNURL-pay destination below."},
      {label: "Separate city signer", state: task.signer ? "ready" : "blocked", detail: task.signer ? `Expected city signer version ${task.signer.version} is confirmed privately. Its key remains outside BitcoinWalk.` : "Create or connect a recoverable city identity and prove control of its exact public key."},
      {label: "City account activation", state: "blocked", detail: "Request-bound approval and relay read-back are still being integrated. Keep your personal dashboard identity; no city account is active yet."},
    ]};
}

export async function saveProSetupSigner(cityId: string, actor: string, command: Extract<ProSetupCommand, {action: "confirm-city-signer"}>, brandProof: Event, origin: string) {
  if (command.cityId !== cityId || command.brandPubkey === actor || command.brandPubkey === SUPER_ADMIN_PUBKEY) throw new Error("Use a separate city signer identity.");
  const before = await resolveProSetupAuthority(cityId, actor);
  authorizeCitySignerProof(brandProof, command, origin);
  const after = await resolveProSetupAuthority(cityId, actor);
  if (JSON.stringify(before.authority) !== JSON.stringify(after.authority)) throw new Error("City authority changed during signer verification. Reload and try again.");
  const {store} = ensureSetupTask(after);
  const task = store.confirmSigner(cityId, after.authority.entitlementId, after.authority.ownerPubkey, command.brandPubkey);
  return {cityId, pubkey: task.signer!.pubkey, version: task.signer!.version, state: "confirmed-not-active" as const,
    message: "Separate city signer confirmed. It is not published or active yet; keep its recovery method safe."};
}

export async function clearProSetupSigner(cityId: string, actor: string) {
  const resolved = await resolveProSetupAuthority(cityId, actor), {store} = ensureSetupTask(resolved);
  const task = store.clearSigner(cityId, resolved.authority.entitlementId, resolved.authority.ownerPubkey);
  return {cityId, state: task.state, cleared: true as const, message: "Saved city signer cleared. Your personal dashboard identity and Pro entitlement were not changed."};
}

export async function saveProSetupPayout(cityId: string, actor: string, destination: string, event: Event) {
  const before = await resolveProSetupAuthority(cityId, actor);
  const blockedDomains = (process.env.BITCOINWALK_PAYOUT_BLOCKED_DOMAINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const validated = await validatePayoutDestination(destination, {blockedDomains});
  const after = await resolveProSetupAuthority(cityId, actor);
  if (JSON.stringify(before.authority) !== JSON.stringify(after.authority)) throw new Error("City authority changed during payout validation. Reload and confirm again.");
  const {store: taskStore} = ensureSetupTask(after);
  const saved = new PayoutDestinationStore(getPaymentRuntime().store.db).save(after.authority, event, validated);
  taskStore.confirmPayout(cityId, after.authority.entitlementId, after.authority.ownerPubkey, saved.version);
  return {cityId: saved.cityId, version: saved.version, destination: saved.normalized, confirmedAt: saved.confirmedAt,
    state: "saved-not-active" as const, message: "Destination saved. City Lightning payments remain disabled until provisioning and read-back succeed."};
}
