import type {Event} from "nostr-tools";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {managedProvisionConfigSchema,provisionConfigSchema, provisionDigest,type ProvisionConfig} from "../rustress/contract";
import {createCityActivation} from "../rustress/activation-contract";
import {resolveCityBrand,type CityBrandAuthority} from "../nostr/city-brand";
import {queryRelayEvents} from "../nostr/city-records";
import {citySetupEvidence} from "./city-setup-evidence";
import {managedCities} from "../nostr/moderation";
import {relayConfig} from "../lib/relay-config";
import {serverReadRelays} from "../lib/server-relay-config";
import {getPaymentRuntime} from "../payments/runtime";
import {ProfileArtworkStore} from "../logos/profile-artwork";
import {managedBackground} from "./share-image";
import {PayoutDestinationStore} from "../payments/payout-destination-store";
import {ProSetupTaskStore} from "../payments/pro-setup-task-store";
import {normalizePayoutDestination,validatePayoutDestination} from "./lnurl-pay";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {authorizeCitySignerProof, type ProSetupCommand} from "../nostr/pro-setup-command";
import {CityBrandStore} from "../directory/city-brand-store";
import type {EventTemplate} from "nostr-tools";
import {cityProvisioningCapabilities, type CityProvisioningCapabilities} from "../rustress/provisioning-capabilities";
import {parsePublicProfile,profileRelays,verifyNip05} from "../nostr/profiles";
import {ChatProvisionStore,type ChatVisibilitySurface} from "../chat-provisioning/store";
import {WalkieTalkieProvisionStore,WALKIE_TALKIE_RELAY} from "../chat-provisioning/walkie-talkie-store";
import {armadaChatUrl} from "../domain/chat";
import {cityOwnerPubkey} from "../domain/city";
import {legacyProEntitlement,type LegacyProEntitlement} from "../payments/legacy-pro-entitlement";
import {isSilentActiveOverride} from "../domain/admin-city-requests";

/** This preflight cannot publish, create invoices, assign identities or activate payments. */
export type ProSetupPreview = {
  cityId: string; cityName: string; revisionId: string;
  profile: {name: string; display_name: string; picture: string; banner: string; website: string; nip05?: string; lud16?: string};
  status: "preparation-only";
  payout: {configured: boolean; destination?: string; version?: number; suggestedDestination?: string; registrationVersion?: number;
    activation?:{activeVersion?:number;pendingVersion?:number;state:"not-active"|"pending"|"needs-attention"|"active"}};
  setup: {state: "setup-required" | "payout-confirmed" | "signer-confirmed" | "ready-for-proof"; updatedAt: number};
  signer: {configured: boolean; pubkey?: string; version?: number};
  activation?: {requestId: string; expiresAt: number; proofsReady: boolean};
  capabilities: CityProvisioningCapabilities;
  community: {walkieTalkieActive:boolean;armadaActive:boolean;walkieTalkieEnabled:boolean;armadaEnabled:boolean;url?:string};
  steps: Array<{label: string; state: "ready" | "blocked"; detail: string}>;
};

// Dependencies stay explicit so incomplete reads and owner changes can be tested without networking.
export async function ownerCityProfileNameMatches(pubkey:string,expectedName:string,relays=profileRelays,read:typeof queryRelayEvents=queryRelayEvents):Promise<boolean>{
  const requested=new Set([pubkey]);
  const reads=await Promise.allSettled(relays.map(async relay=>{
    const events=await read([relay],[0],undefined,{authors:[pubkey],limit:20});
    const latest=events.filter(event=>parsePublicProfile(event,requested)).sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id))[0];
    return latest?parsePublicProfile(latest,requested)?.name===expectedName:false;
  }));
  return reads.filter(row=>row.status==="fulfilled"&&row.value).length>=2;
}

export const proSetupDependencies = {
  ...citySetupEvidence,
  entitlement: (cityId: string):({invoiceId:string;owner:string;legacy?:false}|LegacyProEntitlement)|undefined => {
    const db=getPaymentRuntime().store.db,paid=db.prepare("SELECT invoiceId,owner FROM paid_city_entitlement WHERE cityId=?").get(cityId) as {invoiceId:string;owner:string}|undefined;
    return paid??legacyProEntitlement(db,cityId);
  },
  ownerCityProfileMatches: ownerCityProfileNameMatches,
};
async function resolveProSetupEvidence(cityId: string, deps = proSetupDependencies) {
  const [snapshot, grants] = await Promise.all([deps.snapshot(), deps.grants()]);
  const row = managedCities(snapshot.revisions, snapshot.approvals).find(item => item.state === "approved" && item.revision.city.cityId === cityId);
  const grant = grants.find(item => item.grant.cityId === cityId);
  if (!row || !grant) throw new Error("An approved city and verified creator authorization are required.");
  // Never use the editor who authored the latest revision as owner; directory failures cannot fall back.
  const grantOwner=cityOwnerPubkey(grant.grant),directory = await deps.discover(cityId, grant.grant.creatorPubkey);
  const ownerPubkey = directory?.ownerPubkey ?? grantOwner;
  if(directory&&directory.ownerPubkey!==grantOwner)throw new Error("City directory ownership and CMS permissions differ. Complete or roll back the ownership transfer before continuing.");
  const entitlement = deps.entitlement(cityId);
  if (!entitlement) throw new Error("A settled Pro entitlement is required. This screen never asks you to pay again.");
  if (await deps.restrictions(cityId, ownerPubkey)) throw new Error("City or organizer publishing is suspended. Contact the administrator.");
  const authority: CityBrandAuthority = {cityId, ownerPubkey, authorityEventId: directory?.eventId ?? grant.event.id,
    approvalEventId: row.decision.event.id, entitlementId: entitlement.invoiceId, eligible: true};
  return {authority, row, entitlement, grant};
}

function mepOwnerBrandEligible(resolved:Awaited<ReturnType<typeof resolveProSetupEvidence>>,brandPubkey:string){
 if(resolved.grant.grant.version!==2||resolved.grant.grant.ownerPubkey!==brandPubkey||resolved.grant.grant.ownershipEventId!==resolved.authority.authorityEventId)return false;
 const rows=getPaymentRuntime().store.db.prepare("SELECT challenge FROM city_brand_request WHERE city_id=? AND status='active' ORDER BY rowid DESC").all(resolved.authority.cityId) as Array<{challenge:string}>;
 return rows.some(row=>{try{return (JSON.parse(row.challenge) as import("../nostr/city-brand").CityBrandChallenge).binding.brandPubkey===brandPubkey;}catch{return false;}});
}

export type ProSetupNotification = {cityId:string;cityName:string;ownerPubkey:string;kind:"setup";state:ProSetupPreview["setup"]["state"]|"awaiting-review"|"awaiting-publication"|"active";updatedAt:number}|
  {cityId:string;cityName:string;ownerPubkey:string;kind:"payout-update";payoutVersion:number;state:"queued"|"preparing"|"prepared"|"applying"|"verifying"|"unknown"|"needs-attention"|"active"|"blocked";updatedAt:number};
type SetupNotificationState=Extract<ProSetupNotification,{kind:"setup"}>["state"];
export function proSetupNotificationState(taskState:ProSetupPreview["setup"]["state"],request:{status:"pending"|"approved"|"active";expiresAt:number;ownerProof:string|null;brandProof:string|null}|undefined,now=Math.floor(Date.now()/1000)):SetupNotificationState{
  if(request?.status==="active")return "active";
  if(request?.status==="approved")return "awaiting-publication";
  if(request?.status==="pending"&&request.expiresAt>now&&request.ownerProof&&request.brandProof)return "awaiting-review";
  return taskState;
}
/** Guide-safe projection. Each row is re-authorized against current approval,
 * ownership, entitlement and moderation before it can name a recipient. */
export async function listProSetupNotifications():Promise<ProSetupNotification[]> {
  const db=getPaymentRuntime().store.db,store=new ProSetupTaskStore(db),rows:ProSetupNotification[]=[];
  const updateTable=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rustress_payout_update_task'").get();
  for(const cityId of store.cityIds()){
    const request=db.prepare(`SELECT status,expires_at expiresAt,owner_proof ownerProof,brand_proof brandProof
      FROM city_brand_request WHERE city_id=? AND status IN ('pending','approved','active') ORDER BY rowid DESC LIMIT 1`).get(cityId) as
      {status:"pending"|"approved"|"active";expiresAt:number;ownerProof:string|null;brandProof:string|null}|undefined;
    const update=updateTable?db.prepare("SELECT payout_version payoutVersion,phase state,updated_at updatedAt FROM rustress_payout_update_task WHERE city=? ORDER BY payout_version DESC LIMIT 1").get(cityId) as {payoutVersion:number;state:Extract<ProSetupNotification,{kind:"payout-update"}>["state"];updatedAt:number}|undefined:undefined;
    try{
      const resolved=await resolveProSetupEvidence(cityId);
      if(isSilentActiveOverride(resolved.row.decision.approval.note))continue;
      const {task}=ensureSetupTask(resolved);
      const state=proSetupNotificationState(task.state,request);
      rows.push({cityId,cityName:resolved.row.revision.city.cityName,ownerPubkey:resolved.authority.ownerPubkey,kind:"setup",state,updatedAt:request?.expiresAt??task.updatedAt});
      if(update)rows.push({cityId,cityName:resolved.row.revision.city.cityName,ownerPubkey:resolved.authority.ownerPubkey,kind:"payout-update",...update});
    }catch(error){
      const message=error instanceof Error?error.message:"";
      if(message.startsWith("An approved city and verified creator authorization")||message.startsWith("A settled Pro entitlement")||message.startsWith("City or organizer publishing is suspended"))continue;
      throw error;
    }
  }
  return rows;
}
export async function resolveProSetupAuthority(cityId: string, actor: string, deps = proSetupDependencies) {
  const result = await resolveProSetupEvidence(cityId, deps);
  if (actor !== result.authority.ownerPubkey) throw new Error("Only the current city owner can prepare its Pro account.");
  return result;
}

const brandStore = () => new CityBrandStore(getPaymentRuntime().store.db);

function ensureSetupTask(resolved: Awaited<ReturnType<typeof resolveProSetupAuthority>>) {
  const db = getPaymentRuntime().store.db;
  const binding = resolved.entitlement.legacy?{revisionId:resolved.row.revision.event.id,destinationVersion:resolved.entitlement.registrationVersion}:db.prepare(`SELECT payment_invoice.revisionId,payment_invoice_payout.destinationVersion
    FROM payment_invoice LEFT JOIN payment_invoice_payout ON payment_invoice_payout.invoiceId=payment_invoice.id WHERE payment_invoice.id=?`)
    .get(resolved.entitlement.invoiceId) as {revisionId: string; destinationVersion: number | null} | undefined;
  if (!binding) throw new Error("The settled Pro payment record is incomplete. Contact the administrator; do not pay again.");
  const store = new ProSetupTaskStore(db);
  let task = store.ensure({cityId: resolved.authority.cityId, entitlementId: resolved.entitlement.invoiceId,
    originalOwnerPubkey: resolved.entitlement.owner, currentOwnerPubkey: resolved.authority.ownerPubkey,
    ...(binding.destinationVersion === null ? {} : {registrationVersion: binding.destinationVersion})});
  if(resolved.entitlement.legacy&&!task.signer&&resolved.authority.ownerPubkey===resolved.entitlement.owner)
    task=store.adoptVerifiedSigner(resolved.authority.cityId,resolved.entitlement.invoiceId,resolved.authority.ownerPubkey,resolved.entitlement.brandPubkey);
  return {task, store, binding};
}

let artworkStore: ProfileArtworkStore | undefined;
let artworkConfig = "";
async function profileBrandLogo():Promise<Buffer>{
  try{return await readFile(join(process.cwd(),"public","brand","bitcoinwalk-horizontal-white.png"));}
  catch{throw new Error("BitcoinWalk profile artwork is unavailable. Contact the administrator; do not create another account.");}
}
export async function prepareProSetupPreview(cityId: string, actor: string, origin: string): Promise<ProSetupPreview> {
  const {authority, row} = await resolveProSetupAuthority(cityId, actor);
  const city = row.revision.city, slug = row.decision.approval.slug ?? city.slug;
  const hero = await managedBackground([row.decision.approval.heroImageUrl, city.heroImageUrl]);
  if (!hero) throw new Error("The approved city photo is unavailable. Restore it before preparing the profile.");
  // The public identity already carries the city in its display name. Profile
  // artwork therefore uses the stable BitcoinWalk brand lock-up and does not
  // depend on an optional localized merchandise/logo pack.
  const logo = await profileBrandLogo();
  const mediaRoot = process.env.BITCOINWALK_MEDIA_ROOT;
  if (!mediaRoot) throw new Error("Persistent profile artwork storage is not configured.");
  const config = `${mediaRoot}\n${origin}`;
  if (!artworkStore || artworkConfig !== config) {artworkStore = new ProfileArtworkStore(mediaRoot, origin); artworkConfig = config;}
  const artwork = await artworkStore.ensure({cityId, revisionId: row.revision.event.id, hero, cityLogo: logo});
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
  const activationTable=getPaymentRuntime().store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rustress_activation_task'").get();
  const activeRow=activationTable?getPaymentRuntime().store.db.prepare("SELECT phase,json_extract(activation_config,'$.payoutVersion') payoutVersion FROM rustress_activation_task WHERE city=?").get(cityId) as {phase:string;payoutVersion:number}|undefined:undefined;
  const updateTable=getPaymentRuntime().store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rustress_payout_update_task'").get();
  const update=updateTable?getPaymentRuntime().store.db.prepare("SELECT payout_version payoutVersion,phase state FROM rustress_payout_update_task WHERE city=? ORDER BY payout_version DESC LIMIT 1").get(cityId) as {payoutVersion:number;state:string}|undefined:undefined;
  const payoutActivation=activeRow?.phase==="active"?update&&update.payoutVersion>activeRow.payoutVersion?{activeVersion:activeRow.payoutVersion,pendingVersion:update.payoutVersion,state:update.state==="active"?"active" as const:update.state==="blocked"||update.state==="needs-attention"?"needs-attention" as const:"pending" as const}:{activeVersion:activeRow.payoutVersion,state:"active" as const}:{state:"not-active" as const};
  const capabilities = cityProvisioningCapabilities(getPaymentRuntime().store.db,cityId);
  const database=getPaymentRuntime().store.db,communityRow=new ChatProvisionStore(database).get(cityId),walkieTalkieRow=new WalkieTalkieProvisionStore(database).get(cityId);
  const armadaActive=communityRow?.phase==="active",walkieTalkieActive=walkieTalkieRow?.phase==="active";
  const communityUrl=armadaActive?armadaChatUrl({relay:communityRow.relay,groupId:communityRow.groupId}):null;
  const publicOriginValue=process.env.BITCOINWALK_PUBLIC_ORIGIN?.trim()||"https://bitcoinwalk.org",publicOrigin=new URL(publicOriginValue);
  if(publicOrigin.protocol!=="https:"||publicOrigin.origin!==publicOriginValue)throw new Error("Canonical public origin is not configured.");
  const identifier=`${slug}@${publicOrigin.hostname}`;
  const verifiedNip05=capabilities.nip05==="active"&&!!task.signer&&await verifyNip05(task.signer.pubkey,identifier);
  return {cityId, cityName: city.cityName, revisionId: row.revision.event.id, status: "preparation-only",
    capabilities,community:{walkieTalkieActive,armadaActive,walkieTalkieEnabled:walkieTalkieActive&&walkieTalkieRow.publicEnabled===1,armadaEnabled:armadaActive&&communityRow.armadaEnabled===1,...(communityUrl?{url:communityUrl}:{})},
    setup: {state: task.state, updatedAt: task.updatedAt},
    signer: task.signer ? {configured: true, pubkey: task.signer.pubkey, version: task.signer.version} : {configured: false},
    ...(pending ? {activation: {requestId: pending.id, expiresAt: pending.expires_at, proofsReady: !!pending.owner_proof && !!pending.brand_proof}} : {}),
    payout: payout ? {configured: true, destination: payout.normalized, version: payout.version,activation:payoutActivation} : suggestion ?
      {configured: false, suggestedDestination: suggestion.normalized, registrationVersion: suggestion.version} : {configured: false},
    profile: {name, display_name: name, picture: artwork.avatar.url, banner: artwork.banner.url, website: `${publicOriginValue}/${slug}`,
      ...(verifiedNip05 ? {nip05: identifier} : {}),
      ...(capabilities.lightning === "active" && process.env.BITCOINWALK_RUSTRESS_LNURL_ENABLED === "1" ? {lud16: identifier} : {})},
    steps: [
      {label: "Pro entitlement and city ownership", state: "ready", detail: "Verified against current approval, ownership, moderation and either settled payment or operator-confirmed legacy activation evidence."},
      {label: "City profile artwork", state: "ready", detail: "Prepared from the approved city photo. The avatar uses the larger icon without city lettering."},
      {label: "Personal payout destination", state: payout ? "ready" : "blocked", detail: payout ? payoutActivation.state==="active"&&payoutActivation.activeVersion===payout.version?`Owner-confirmed destination version ${payout.version} is active.`:payoutActivation.state==="pending"?`Destination version ${payout.version} is being verified. Version ${payoutActivation.activeVersion} remains active until it passes.`:payoutActivation.state==="needs-attention"?`Destination version ${payout.version} needs attention. Version ${payoutActivation.activeVersion} remains active.`:`Owner-confirmed destination version ${payout.version} is saved privately. It is not active until provisioning is verified.` : suggestion ? "Your checkout destination was recovered privately. Confirm it again with the current city owner’s signer before activation." : "Add and confirm your personal Lightning address or LNURL-pay destination below."},
      {label: "City signer", state: task.signer ? "ready" : "blocked", detail: task.signer ? `Expected city signer version ${task.signer.version} is confirmed privately. Its key remains outside BitcoinWalk.` : `Create or connect a recoverable city identity, or reuse the owner account when its public profile is already named ${name}.`},
      {label: "NIP-05 identity", state: capabilities.nip05 === "active" ? "ready" : "blocked", detail: capabilities.nip05 === "active" ? `${slug}@bitcoinwalk.org is independently verified against the city signer.` : `Status: ${capabilities.nip05}. ${capabilities.detail}`},
      {label: "Lightning address", state: capabilities.lightning === "active" ? "ready" : "blocked", detail: capabilities.lightning === "active" ? `${slug}@bitcoinwalk.org passed independent LNURL-pay verification.` : `Status: ${capabilities.lightning}. ${capabilities.detail}`},
    ]};
}

export async function setProCommunityVisibility(cityId:string,actor:string,surface:ChatVisibilitySurface,enabled:boolean){
  const before=await resolveProSetupAuthority(cityId,actor),database=getPaymentRuntime().store.db,armadaStore=new ChatProvisionStore(database),walkieTalkieStore=new WalkieTalkieProvisionStore(database);
  const row=surface==="walkie-talkie"?walkieTalkieStore.get(cityId):armadaStore.get(cityId);
  if(!row||row.phase!=="active")throw new Error(`Active ${surface==="walkie-talkie"?"Walkie Talkie":"Armada"} setup is required before changing public visibility.`);
  const after=await resolveProSetupAuthority(cityId,actor);if(JSON.stringify(before.authority)!==JSON.stringify(after.authority))throw new Error("City authority changed during the community visibility update. Reload and try again.");
  if(surface==="walkie-talkie")walkieTalkieStore.setVisibility(cityId,enabled,Math.floor(Date.now()/1000),{tier:"pro",bindingId:before.entitlement.invoiceId,relay:WALKIE_TALKIE_RELAY});
  else armadaStore.setVisibility(cityId,surface,enabled,Math.floor(Date.now()/1000),{tier:"pro",bindingId:before.entitlement.invoiceId,relay:row.relay});
  const walkieTalkie=walkieTalkieStore.get(cityId),armada=armadaStore.get(cityId),walkieTalkieActive=walkieTalkie?.phase==="active",armadaActive=armada?.phase==="active",url=armadaActive?armadaChatUrl({relay:armada.relay,groupId:armada.groupId}):null,label=surface==="walkie-talkie"?"Walkie Talkie":"Armada";
  return {walkieTalkieActive,armadaActive,walkieTalkieEnabled:walkieTalkieActive&&walkieTalkie.publicEnabled===1,armadaEnabled:armadaActive&&armada.armadaEnabled===1,...(url?{url}:{}),message:enabled?`${label} is now shown on this city’s public pages.`:`${label} is now hidden from this city’s public pages. The community and its history were not deleted.`};
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
  const resolved = await resolveProSetupAuthority(cityId, actor), result=brandStore().cancel(requestId, actor, resolved.authority);
  return {requestId, cancelled: result === "cancelled", expired: result === "expired",
    message: result === "expired" ? "Activation request had already expired. Your signer, payout setup and Pro entitlement remain saved; prepare a new request when ready." :
      "Activation request cancelled. Your signer, payout setup and Pro entitlement remain saved."};
}

export async function listBrandRequests(actor: string) {
  if (actor !== SUPER_ADMIN_PUBKEY) throw new Error("Super-admin review required.");
  const store=brandStore();
  return [...store.reviewQueue(),...store.completed()].map(row => ({requestId: row.id, cityId: row.city_id, expiresAt: row.expires_at,state:row.status as "pending"|"approved"|"active",
    brandPubkey: row.challenge.binding.brandPubkey, profile: row.challenge.profile, proofsReady: !!row.owner_proof && !!row.brand_proof}));
}

async function brandReviewEvidence(requestId: string, actor: string, allowPayoutChange = false) {
  if (actor !== SUPER_ADMIN_PUBKEY) throw new Error("Super-admin review required.");
  const store = brandStore(), request = store.details(requestId), resolved = await resolveProSetupEvidence(request.city_id);assertBrandTask(request.challenge,resolved,allowPayoutChange);
  return {store, request, resolved};
}
function assertBrandTask(challenge: import("../nostr/city-brand").CityBrandChallenge, resolved: Awaited<ReturnType<typeof resolveProSetupEvidence>>, allowPayoutChange = false) {
  const {task}=ensureSetupTask(resolved),profile=challenge.profile;
  if(!task.signer||!task.artwork||!task.payoutVersion||task.signer.pubkey!==challenge.binding.brandPubkey||task.signer.version!==profile.signerVersion||
    task.artwork.version!==profile.artworkVersion||task.artwork.revisionId!==profile.revisionId||task.artwork.avatar!==profile.picture||task.artwork.banner!==profile.banner||
    !allowPayoutChange&&task.payoutVersion!==profile.payoutVersion)throw new Error("City signer, payout or artwork changed. Cancel this request and prepare a new one.");
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
  if (process.env.BITCOINWALK_RUSTRESS_FIXTURE_ENABLED === "1") {
    try {await (await import("./rustress-workflow")).queueIsolatedProvisioning(requestId);}
    catch {console.warn("Isolated provisioning queue deferred. City identity remains recorded; retry confirmation to queue safely.");}
  }
  if (process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED === "1") {
    try {await (await import("./rustress-activation")).queueManagedProvisioning(requestId);}
    catch {console.warn("Managed city reservation deferred. City identity remains recorded; the durable worker will retry safely.");}
  }
}

export async function saveProSetupSigner(cityId: string, actor: string, command: Extract<ProSetupCommand, {action: "confirm-city-signer"}>, brandProof: Event, origin: string) {
  if (command.cityId !== cityId || command.brandPubkey === SUPER_ADMIN_PUBKEY) throw new Error("Use a separate city signer identity.");
  const before = await resolveProSetupAuthority(cityId, actor);
  const mep=command.brandPubkey===actor&&mepOwnerBrandEligible(before,command.brandPubkey);
  if(command.brandPubkey===actor&&!mep)throw new Error("Use a separate city signer identity.");
  authorizeCitySignerProof(brandProof, command, origin);
  const after = await resolveProSetupAuthority(cityId, actor);
  if (JSON.stringify(before.authority) !== JSON.stringify(after.authority)) throw new Error("City authority changed during signer verification. Reload and try again.");
  const {store} = ensureSetupTask(after);
  const task = store.confirmSigner(cityId, after.authority.entitlementId, after.authority.ownerPubkey, command.brandPubkey,Math.floor(Date.now()/1000),mep&&mepOwnerBrandEligible(after,command.brandPubkey));
  return {cityId, pubkey: task.signer!.pubkey, version: task.signer!.version, state: "confirmed-not-active" as const,
    message: mep?"Transferred city owner and existing public city identity confirmed. No new key or purchase was created; keep its recovery method safe.":"Separate city signer confirmed. This check did not publish, replace or deactivate the city identity; keep its recovery method safe."};
}

export async function reuseOwnerAsCitySigner(cityId:string,actor:string,command:Extract<ProSetupCommand,{action:"reuse-owner-city-signer"}>,deps=proSetupDependencies){
  if(command.cityId!==cityId||actor===SUPER_ADMIN_PUBKEY)throw new Error("The connected owner account cannot be used as this city identity.");
  const before=await resolveProSetupAuthority(cityId,actor,deps),expectedName=`BitcoinWalk in ${before.row.revision.city.cityName}`;
  if(!await deps.ownerCityProfileMatches(actor,expectedName))throw new Error(`The connected owner profile must already be named exactly “${expectedName}” on at least two public relays.`);
  const after=await resolveProSetupAuthority(cityId,actor,deps);
  if(JSON.stringify(before.authority)!==JSON.stringify(after.authority)||before.row.revision.city.cityName!==after.row.revision.city.cityName)
    throw new Error("City authority changed during signer verification. Reload and try again.");
  const {store}=ensureSetupTask(after),task=store.confirmSigner(cityId,after.authority.entitlementId,after.authority.ownerPubkey,actor,Math.floor(Date.now()/1000),true);
  return {cityId,pubkey:task.signer!.pubkey,version:task.signer!.version,state:"confirmed-not-active" as const,
    message:"Existing BitcoinWalk city identity confirmed. No new signer was created; keep its recovery method safe."};
}

export async function clearProSetupSigner(cityId: string, actor: string) {
  const resolved = await resolveProSetupAuthority(cityId, actor), {store} = ensureSetupTask(resolved);
  const task = store.clearSigner(cityId, resolved.authority.entitlementId, resolved.authority.ownerPubkey);
  return {cityId, state: task.state, cleared: true as const, message: "Saved city signer cleared. Your personal dashboard identity and Pro entitlement were not changed."};
}

export async function saveProSetupPayout(cityId: string, actor: string, destination: string, event: Event) {
  const before = await resolveProSetupAuthority(cityId, actor);
  const blockedDomains = ["bitcoinwalk.org",...(process.env.BITCOINWALK_PAYOUT_BLOCKED_DOMAINS ?? "").split(",").map(value => value.trim()).filter(Boolean)];
  const validated = await validatePayoutDestination(destination, {blockedDomains});
  const after = await resolveProSetupAuthority(cityId, actor);
  if (JSON.stringify(before.authority) !== JSON.stringify(after.authority)) throw new Error("City authority changed during payout validation. Reload and confirm again.");
  const {store: taskStore} = ensureSetupTask(after);
  const saved = new PayoutDestinationStore(getPaymentRuntime().store.db).save(after.authority, event, validated);
  taskStore.confirmPayout(cityId, after.authority.entitlementId, after.authority.ownerPubkey, saved.version);
  let update:"not-required"|"queued"|"deferred"="not-required";
  if(process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED==="1")try{update=await (await import("./rustress-activation")).queueManagedPayoutUpdate(cityId)?"queued":"not-required";}catch{update="deferred";}
  return {cityId: saved.cityId, version: saved.version, destination: saved.normalized, confirmedAt: saved.confirmedAt,
    validation:validated.probe??{amountMsat:Math.ceil(validated.minSendable/1000)*1000,payment:"verified" as const,nip57:"not-advertised" as const},
    state: update==="not-required"?"saved-not-active" as const:"saved-pending-update" as const,update,
    message: update==="queued"?"Destination saved. The existing payout remains active until the replacement is independently verified.":
      update==="deferred"?"Destination saved. The existing payout remains active; automatic replacement will retry safely.":
      "Destination saved. City Lightning payments remain disabled until provisioning and read-back succeed."};
}

/** Internal worker resolver, never a browser-supplied provisioning payload.
 * Requires a published signed binding and repeats authority/read-back checks on
 * every call. Initial activation also probes the private payout destination;
 * an already applied immutable version is rechecked from durable signed state.
 * Calling this does not create invoices or make provisioning publicly active. */
export async function resolveRustressProvisionEvidence(requestId: string, payoutVersion?: number, revalidatePayout = true) {
  const before = await brandReviewEvidence(requestId, SUPER_ADMIN_PUBKEY, true);
  const {authority} = before.resolved;
  const approved = before.store.approvedForPublication(requestId, SUPER_ADMIN_PUBKEY, authority);
  if (approved.row.status !== "active") throw new Error("City identity must be active before provisioning.");
  // Worker read-back uses the same authoritative relay's internal listener.
  // Public write URLs remain unchanged for browser publication.
  const relays = serverReadRelays();
  if (!relays.length) throw new Error("No city identity read-back relay is configured.");
  for (const relay of relays) {
    const history = await brandPublicationDependencies.read(relay, authority.cityId);
    const current = history.length < 500 ? resolveCityBrand(history, authority.cityId) : null;
    if (!current || current.event.id !== approved.event.id || current.binding.action === "revoke")
      throw new Error("City identity read-back is incomplete or superseded.");
  }
  const destinations = new PayoutDestinationStore(getPaymentRuntime().store.db);
  const payout = payoutVersion === undefined ? destinations.current(authority.cityId) : destinations.version(authority.cityId, payoutVersion);
  // The published binding establishes the city identity, not an immutable
  // payout destination. Before initial provisioning, accept the freshest
  // owner-signed destination and bind its version into the provider evidence.
  if (!payout || payout.ownerPubkey !== authority.ownerPubkey)
    throw new Error("Current owner payout confirmation is required.");
  // Initial activation and payout replacements must prove that the personal
  // destination can issue a provider-bound invoice. Once the exact immutable
  // payout version is applied, routine NIP-05/LNURL read-back must not probe the
  // organizer's personal endpoint again: a temporary downstream outage must
  // not withdraw an otherwise exact city identity or its public address.
  const normalized = revalidatePayout
    ? (await validatePayoutDestination(payout.normalized, {blockedDomains: ["bitcoinwalk.org",
        ...(process.env.BITCOINWALK_PAYOUT_BLOCKED_DOMAINS ?? "").split(",").map(value => value.trim()).filter(Boolean)]})).normalized
    : normalizePayoutDestination(payout.normalized).normalized;
  if (normalized !== payout.normalized) throw new Error("Payout destination changed.");
  const after = await brandReviewEvidence(requestId, SUPER_ADMIN_PUBKEY, true);
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

/** Managed activation evidence uses the same freshly revalidated authority as
 * fixture reservation, but binds the real managed wallet reference. */
export async function resolveRustressActivationEvidence(requestId: string, publicOrigin = "https://bitcoinwalk.org",current?:ProvisionConfig) {
  const evidence = await resolveRustressProvisionEvidence(requestId,current?.payoutVersion,current===undefined);
  const reserved = provisionConfigSchema.parse({...evidence.config, walletRef: "bitcoinwalk-rustress"});
  const activation = current??createCityActivation(reserved);
  if(current){const base=createCityActivation(reserved);if(payoutUpdateStableFields.some(field=>current[field]!==base[field])||current.payoutVersion!==base.payoutVersion)
    throw new Error("Active city payment authority changed.");}
  const predecessor=current?provisionConfigSchema.parse({...current,version:current.version-1,invoiceIssuance:"disabled"}):reserved;
  return {reserved:predecessor, activation, publicOrigin,
    proofHash: createHash("sha256").update(JSON.stringify({reservationProof: evidence.proofHash,
      reserved: provisionDigest(predecessor), activation: provisionDigest(activation)})).digest("hex")};
}

const payoutUpdateStableFields=["cityId","domain","localPart","brandPubkey","authorityEventId","approvalEventId","brandEventId","walletRef","organizerBasisPoints","retainedBasisPoints"] as const satisfies readonly (keyof import("../rustress/contract").ProvisionConfig)[];

/** Rebuilds a payout-only successor from live owner, binding and endpoint
 * evidence. The active configuration is never replaced by browser input. */
export async function resolveRustressPayoutUpdateEvidence(requestId:string,current:ProvisionConfig,publicOrigin="https://bitcoinwalk.org"){
  const db=getPaymentRuntime().store.db,regular=db.prepare("SELECT 1 FROM city_brand_request WHERE id=? AND status='active'").get(requestId);
  if(!regular){
    const active=db.prepare("SELECT request FROM rustress_activation_task WHERE city=? AND phase='active'").get(current.cityId) as {request:string}|undefined;
    const resolved=await resolveProSetupEvidence(current.cityId);
    if(!active||active.request!==requestId||!resolved.entitlement.legacy)throw new Error("Current city payment authority does not permit this payout update.");
    const payout=new PayoutDestinationStore(db).current(current.cityId);
    if(!payout||payout.ownerPubkey!==resolved.authority.ownerPubkey||payout.version<=current.payoutVersion)throw new Error("Current owner payout confirmation is required.");
    const normalized=(await validatePayoutDestination(payout.normalized,{blockedDomains:["bitcoinwalk.org",
      ...(process.env.BITCOINWALK_PAYOUT_BLOCKED_DOMAINS??"").split(",").map(value=>value.trim()).filter(Boolean)]})).normalized;
    if(normalized!==payout.normalized)throw new Error("Payout destination changed.");
    const saved=db.prepare("SELECT authority,owner_event_id ownerEventId FROM payout_destination_version WHERE city_id=? AND version=?").get(current.cityId,payout.version) as {authority:string;ownerEventId:string}|undefined;
    if(!saved)throw new Error("Owner-signed payout evidence is incomplete.");
    const config=managedProvisionConfigSchema.parse({...current,version:current.version+1,payoutVersion:payout.version,payoutDestination:payout.normalized,invoiceIssuance:"enabled"});
    return {config,publicOrigin,proofHash:createHash("sha256").update(JSON.stringify({legacyEntitlement:resolved.entitlement.invoiceId,
      ownerEvent:saved.ownerEventId,authority:saved.authority,previous:provisionDigest(current),update:provisionDigest(config)})).digest("hex")};
  }
  const evidence=await resolveRustressProvisionEvidence(requestId),base={...evidence.config,walletRef:"bitcoinwalk-rustress"};
  if(current.invoiceIssuance!=="enabled"||payoutUpdateStableFields.some(field=>current[field]!==base[field])||base.payoutVersion<=current.payoutVersion)
    throw new Error("Current city payment authority does not permit this payout update.");
  const config=managedProvisionConfigSchema.parse({...current,version:current.version+1,payoutVersion:base.payoutVersion,
    payoutDestination:base.payoutDestination,invoiceIssuance:"enabled"});
  return {config,publicOrigin,proofHash:createHash("sha256").update(JSON.stringify({authorityProof:evidence.proofHash,
    previous:provisionDigest(current),update:provisionDigest(config)})).digest("hex")};
}
