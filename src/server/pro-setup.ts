import type {Event} from "nostr-tools";
import {createHash} from "node:crypto";
import {provisionConfigSchema} from "../rustress/contract";
import {resolveCityBrand,type CityBrandAuthority} from "../nostr/city-brand";
import {queryRelayEvents} from "../nostr/city-records";
import {citySetupEvidence} from "./city-setup-evidence";
import {managedCities} from "../nostr/moderation";
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
import {CityBrandStore} from "../directory/city-brand-store";
import type {EventTemplate} from "nostr-tools";

/** This preflight cannot publish, create invoices, assign identities or activate payments. */
export type ProSetupPreview = {
  cityId: string; cityName: string; revisionId: string;
  profile: {name: string; display_name: string; picture: string; banner: string; website: string};
  status: "preparation-only";
  payout: {configured: boolean; destination?: string; version?: number; suggestedDestination?: string; registrationVersion?: number};
  setup: {state: "setup-required" | "payout-confirmed" | "signer-confirmed" | "ready-for-proof"; updatedAt: number};
  signer: {configured: boolean; pubkey?: string; version?: number};
  activation?: {requestId: string; expiresAt: number; proofsReady: boolean};
  steps: Array<{label: string; state: "ready" | "blocked"; detail: string}>;
};

// Dependencies stay explicit so incomplete reads and owner changes can be tested without networking.
export const proSetupDependencies = {
  ...citySetupEvidence,
  entitlement: (cityId: string) => getPaymentRuntime().store.db.prepare(
    "SELECT invoiceId,owner FROM paid_city_entitlement WHERE cityId=?").get(cityId) as {invoiceId: string; owner: string} | undefined,
};
async function resolveProSetupEvidence(cityId: string, deps = proSetupDependencies) {
  const [snapshot, grants] = await Promise.all([deps.snapshot(), deps.grants()]);
  const row = managedCities(snapshot.revisions, snapshot.approvals).find(item => item.state === "approved" && item.revision.city.cityId === cityId);
  const grant = grants.find(item => item.grant.cityId === cityId);
  if (!row || !grant) throw new Error("An approved city and verified creator authorization are required.");
  // Never use the editor who authored the latest revision as owner; directory failures cannot fall back.
  const directory = await deps.discover(cityId, grant.grant.creatorPubkey);
  const ownerPubkey = directory?.ownerPubkey ?? grant.grant.creatorPubkey;
  const entitlement = deps.entitlement(cityId);
  if (!entitlement) throw new Error("A settled Pro entitlement is required. This screen never asks you to pay again.");
  if (await deps.restrictions(cityId, ownerPubkey)) throw new Error("City or organizer publishing is suspended. Contact the administrator.");
  const authority: CityBrandAuthority = {cityId, ownerPubkey, authorityEventId: directory?.eventId ?? grant.event.id,
    approvalEventId: row.decision.event.id, entitlementId: entitlement.invoiceId, eligible: true};
  return {authority, row, entitlement};
}
export async function resolveProSetupAuthority(cityId: string, actor: string, deps = proSetupDependencies) {
  const result = await resolveProSetupEvidence(cityId, deps);
  if (actor !== result.authority.ownerPubkey) throw new Error("Only the current city owner can prepare its Pro account.");
  return result;
}

const brandStore = () => new CityBrandStore(getPaymentRuntime().store.db);

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
  const {store: taskStore, binding} = ensureSetupTask(fresh);
  const artworkTask = taskStore.confirmArtwork(cityId, fresh.authority.entitlementId, fresh.authority.ownerPubkey,
    {revisionId: row.revision.event.id, avatar: artwork.avatar.url, banner: artwork.banner.url});
  const destinations = new PayoutDestinationStore(getPaymentRuntime().store.db);
  const stored = destinations.current(cityId);
  const payout = stored?.ownerPubkey === fresh.authority.ownerPubkey ? stored : null;
  const task = payout && artworkTask.payoutVersion !== payout.version ?
    taskStore.confirmPayout(cityId, fresh.authority.entitlementId, fresh.authority.ownerPubkey, payout.version) : artworkTask;
  const registration = !payout && task.registrationVersion ? destinations.registration(cityId, task.registrationVersion) : undefined;
  const suggestion = registration?.ownerPubkey === fresh.authority.ownerPubkey && registration.revisionId === binding.revisionId ? registration : undefined;
  const pending = brandStore().pendingForCity(cityId);
  return {cityId, cityName: city.cityName, revisionId: row.revision.event.id, status: "preparation-only",
    setup: {state: task.state, updatedAt: task.updatedAt},
    signer: task.signer ? {configured: true, pubkey: task.signer.pubkey, version: task.signer.version} : {configured: false},
    ...(pending ? {activation: {requestId: pending.id, expiresAt: pending.expires_at, proofsReady: !!pending.owner_proof && !!pending.brand_proof}} : {}),
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

export async function prepareBrandRequest(cityId: string, actor: string, origin: string) {
  const resolved = await resolveProSetupAuthority(cityId, actor), {task} = ensureSetupTask(resolved);
  if (!task.signer || !task.payoutVersion || !task.artwork || task.artwork.revisionId !== resolved.row.revision.event.id) throw new Error("Complete payout, signer and current artwork setup before preparing activation.");
  const city = resolved.row.revision.city, slug = resolved.row.decision.approval.slug ?? city.slug;
  const profile = {revisionId: task.artwork.revisionId, artworkVersion: task.artwork.version, signerVersion: task.signer.version, payoutVersion: task.payoutVersion,
    name: `BitcoinWalk in ${city.cityName}`, picture: task.artwork.avatar,
    banner: task.artwork.banner, website: `${origin}/${slug}`};
  return brandStore().prepare(actor, resolved.authority, origin, task.signer.pubkey, "activate", profile);
}

export async function submitBrandProofs(cityId: string, requestId: string, actor: string, ownerProof: Event, signerProof: Event) {
  const resolved = await resolveProSetupAuthority(cityId, actor), store=brandStore(),request=store.details(requestId);assertBrandTask(request.challenge,resolved);
  const row = store.submitProofs(requestId, actor, resolved.authority, ownerProof, signerProof);
  return {requestId: row.id, expiresAt: row.expires_at, proofsReady: true, state: "awaiting-super-admin" as const,
    message: "Organizer and city-signer proofs saved privately. Super-admin review is required; nothing has been published."};
}

export async function cancelBrandRequest(cityId: string, requestId: string, actor: string) {
  const resolved = await resolveProSetupAuthority(cityId, actor); brandStore().cancel(requestId, actor, resolved.authority);
  return {requestId, cancelled: true as const, message: "Activation request cancelled. Your signer, payout setup and Pro entitlement remain saved."};
}

export async function listBrandRequests(actor: string) {
  if (actor !== SUPER_ADMIN_PUBKEY) throw new Error("Super-admin review required.");
  return brandStore().reviewQueue().map(row => ({requestId: row.id, cityId: row.city_id, expiresAt: row.expires_at,state:row.status as "pending"|"approved",
    brandPubkey: row.challenge.binding.brandPubkey, profile: row.challenge.profile, proofsReady: !!row.owner_proof && !!row.brand_proof}));
}

async function brandReviewEvidence(requestId: string, actor: string) {
  if (actor !== SUPER_ADMIN_PUBKEY) throw new Error("Super-admin review required.");
  const store = brandStore(), request = store.details(requestId), resolved = await resolveProSetupEvidence(request.city_id);assertBrandTask(request.challenge,resolved);
  return {store, request, resolved};
}
function assertBrandTask(challenge: import("../nostr/city-brand").CityBrandChallenge, resolved: Awaited<ReturnType<typeof resolveProSetupEvidence>>) {
  const {task}=ensureSetupTask(resolved),profile=challenge.profile;
  if(!task.signer||!task.artwork||!task.payoutVersion||task.signer.pubkey!==challenge.binding.brandPubkey||task.signer.version!==profile.signerVersion||
    task.artwork.version!==profile.artworkVersion||task.artwork.revisionId!==profile.revisionId||task.artwork.avatar!==profile.picture||task.artwork.banner!==profile.banner||
    task.payoutVersion!==profile.payoutVersion)throw new Error("City signer, payout or artwork changed. Cancel this request and prepare a new one.");
}
export async function reviewBrandRequest(requestId: string, actor: string): Promise<EventTemplate> {
  const {store, resolved} = await brandReviewEvidence(requestId, actor); return store.reviewStored(requestId, actor, resolved.authority);
}
export async function approveBrandRequest(requestId: string, actor: string, signed: Event) {
  const {store, resolved} = await brandReviewEvidence(requestId, actor), event = store.approveStored(requestId, actor, resolved.authority, signed);
  return {requestId, eventId: event.id, state: "approved-not-published" as const,
    message: "Exact city binding signed and stored privately. Publish it separately; it becomes active only after exact relay read-back."};
}

export const brandPublicationDependencies={
  relays:()=>relayConfig.writeRelays,
  read:(relay:string,cityId:string)=>queryRelayEvents([relay],[30312],undefined,{authors:[SUPER_ADMIN_PUBKEY],"#i":[cityId],limit:500}),
};
export async function prepareBrandPublication(requestId:string,actor:string){
  const {store,request,resolved}=await brandReviewEvidence(requestId,actor);assertBrandTask(request.challenge,resolved);
  const approved=store.approvedForPublication(requestId,actor,resolved.authority);
  return {requestId,event:approved.event,state:approved.row.status,message:approved.row.status==="active"?"This city identity is already active.":"Fresh authority and setup checks passed. Publish this exact signed binding unchanged."};
}
export async function confirmBrandPublication(requestId:string,actor:string,deps=brandPublicationDependencies){
  const before=await brandReviewEvidence(requestId,actor),approved=before.store.approvedForPublication(requestId,actor,before.resolved.authority);
  if(approved.row.status==="active"){
    await queueProvisioningIfEnabled(requestId);
    return {requestId,eventId:approved.event.id,state:"active" as const,relays:JSON.parse(approved.publication!.relays) as string[],message:"City identity is active; exact relay read-back was already recorded."};
  }
  const relays=deps.relays();if(!relays.length)throw new Error("No city identity publication relay is configured.");
  const histories:Event[][]=[];
  for(const relay of relays){
    const events=await deps.read(relay,approved.row.city_id);
    if(events.length>=500)throw new Error("City identity relay history is incomplete.");
    if(resolveCityBrand(events,approved.row.city_id)?.event.id!==approved.event.id)throw new Error(`Exact city identity was not read back from ${relay}`);
    histories.push(events);
  }
  const after=await brandReviewEvidence(requestId,actor);assertBrandTask(after.request.challenge,after.resolved);
  if(JSON.stringify(before.resolved.authority)!==JSON.stringify(after.resolved.authority))throw new Error("City authority changed during publication confirmation.");
  const activated=after.store.activate(requestId,actor,after.resolved.authority,histories[0],relays);
  await queueProvisioningIfEnabled(requestId);
  return {requestId,eventId:activated.event.id,state:"active" as const,relays,message:`City identity activated after exact read-back from ${relays.length} relay(s).`};
}

async function queueProvisioningIfEnabled(requestId: string) {
  if (process.env.BITCOINWALK_RUSTRESS_FIXTURE_ENABLED !== "1") return;
  try {await (await import("./rustress-workflow")).queueIsolatedProvisioning(requestId);}
  catch {console.warn("Isolated provisioning queue deferred. City identity remains recorded; retry confirmation to queue safely.");}
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

/** Internal worker resolver, never a browser-supplied provisioning payload.
 * Requires a published signed binding and repeats live checks on every call.
 * Calling this does not create invoices or make provisioning publicly active. */
export async function resolveRustressProvisionEvidence(requestId: string) {
  const before = await brandReviewEvidence(requestId, SUPER_ADMIN_PUBKEY);
  const {authority} = before.resolved;
  const approved = before.store.approvedForPublication(requestId, SUPER_ADMIN_PUBKEY, authority);
  if (approved.row.status !== "active") throw new Error("City identity must be active before provisioning.");
  const relays = brandPublicationDependencies.relays();
  if (!relays.length) throw new Error("No city identity read-back relay is configured.");
  for (const relay of relays) {
    const history = await brandPublicationDependencies.read(relay, authority.cityId);
    const current = history.length < 500 ? resolveCityBrand(history, authority.cityId) : null;
    if (!current || current.event.id !== approved.event.id || current.binding.action === "revoke")
      throw new Error("City identity read-back is incomplete or superseded.");
  }
  const destinations = new PayoutDestinationStore(getPaymentRuntime().store.db);
  const payout = destinations.current(authority.cityId);
  if (!payout || payout.ownerPubkey !== authority.ownerPubkey || payout.version !== before.request.challenge.profile.payoutVersion)
    throw new Error("Current owner payout confirmation is required.");
  const validated = await validatePayoutDestination(payout.normalized, {blockedDomains: ["bitcoinwalk.org",
    ...(process.env.BITCOINWALK_PAYOUT_BLOCKED_DOMAINS ?? "").split(",").map(value => value.trim()).filter(Boolean)]});
  if (validated.normalized !== payout.normalized) throw new Error("Payout destination changed.");
  const after = await brandReviewEvidence(requestId, SUPER_ADMIN_PUBKEY);
  const confirmed = after.store.approvedForPublication(requestId, SUPER_ADMIN_PUBKEY, after.resolved.authority);
  if (JSON.stringify(authority) !== JSON.stringify(after.resolved.authority) || confirmed.event.id !== approved.event.id ||
      confirmed.row.status !== "active" || JSON.stringify(destinations.current(authority.cityId)) !== JSON.stringify(payout))
    throw new Error("City provisioning evidence changed during verification.");
  const city = after.resolved.row;
  const config = provisionConfigSchema.parse({cityId: authority.cityId, version: 1, domain: "bitcoinwalk.org",
    localPart: city.decision.approval.slug ?? city.revision.city.slug,
    brandPubkey: after.request.challenge.binding.brandPubkey, authorityEventId: authority.authorityEventId,
    approvalEventId: authority.approvalEventId, brandEventId: approved.event.id, payoutVersion: payout.version,
    payoutDestination: payout.normalized, walletRef: "isolated-test", organizerBasisPoints: 7900, retainedBasisPoints: 2100,
    invoiceIssuance: "disabled"});
  return {config, proofHash: createHash("sha256").update(JSON.stringify({authority, profile: after.request.challenge.profile,
    brandEventId: approved.event.id, payoutVersion: payout.version})).digest("hex")};
}
