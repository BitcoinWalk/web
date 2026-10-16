import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {getEventHash,verifyEvent,type Event} from "nostr-tools";
import {MADEIRA_PILOT} from "../nostr/madeira-pilot";
import {madeiraManagedActivationChallengeSchema,verifyMadeiraManagedActivationProof} from "../nostr/madeira-managed-activation";
import {managedProvisionConfigSchema} from "../rustress/contract";

export type LegacyProEntitlement={invoiceId:string;owner:string;brandPubkey:string;registrationVersion:number;legacy:true};
type ActivationRow={request:string;activation_config:string;proof:string;phase:string;nip05:string;lnurl:string};
type GrantRow={challenge:string;owner:string|null;admin:string|null};
type IdentityRow={evidence_hash:string;challenge:string;owner_proof:string;admin_proof:string;activation_config:string;activation_request:string;activation_proof:string;status:string};
type StoredRow={cityId:string;entitlementId:string;originalOwnerPubkey:string;brandPubkey:string;registrationVersion:number;evidenceHash:string;source:string};
type RegistrationRow={city_id:string;revision_id:string;version:number;owner_pubkey:string;normalized:string;endpoint:string;callback:string;min_sendable:number;max_sendable:number;owner_event_id:string;owner_event:string;confirmed_at:number};

function table(db:DatabaseSync,name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
function activation(db:DatabaseSync){
  if(!table(db,"rustress_activation_task"))throw new Error("Madeira legacy entitlement requires active managed-service evidence.");
  const row=db.prepare("SELECT request,activation_config,proof,phase,nip05,lnurl FROM rustress_activation_task WHERE city=?").get(MADEIRA_PILOT.cityId) as ActivationRow|undefined;
  if(!row||row.phase!=="active"||row.nip05!=="active"||row.lnurl!=="active"||!/^[0-9a-f]{64}$/.test(row.proof))throw new Error("Madeira legacy entitlement requires exact active NIP-05 and Lightning evidence.");
  const config=managedProvisionConfigSchema.parse(JSON.parse(row.activation_config));
  if(config.cityId!==MADEIRA_PILOT.cityId||config.domain!=="bitcoinwalk.org"||config.localPart!=="madeira"||config.brandPubkey!==MADEIRA_PILOT.pubkey||
    config.walletRef!=="bitcoinwalk-rustress"||config.organizerBasisPoints!==7900||config.retainedBasisPoints!==2100||config.invoiceIssuance!=="enabled")
    throw new Error("Madeira legacy activation no longer matches the reviewed 79/21 city authority.");
  return {row,config};
}

function signedEvidence(db:DatabaseSync,now:number){
  if(table(db,"madeira_managed_activation")){
    const grant=db.prepare("SELECT challenge,owner,admin FROM madeira_managed_activation WHERE singleton=1").get() as GrantRow|undefined;
    if(!grant?.owner||!grant.admin)throw new Error("Madeira legacy entitlement requires both saved activation proofs.");
    const challenge=madeiraManagedActivationChallengeSchema.parse(JSON.parse(grant.challenge));
    verifyMadeiraManagedActivationProof(JSON.parse(grant.owner) as Event,challenge,"owner",now,true);
    verifyMadeiraManagedActivationProof(JSON.parse(grant.admin) as Event,challenge,"admin",now,true);
    return {challenge,evidenceHash:createHash("sha256").update([grant.challenge,grant.owner,grant.admin].join("\n")).digest("hex"),source:"madeira-managed-activation-v1"};
  }
  if(table(db,"rustress_public_identity")){
    const row=db.prepare("SELECT evidence_hash,challenge,owner_proof,admin_proof,activation_config,activation_request,activation_proof,status FROM rustress_public_identity WHERE source_city=? AND local_part='madeira' AND domain='bitcoinwalk.org'").get(MADEIRA_PILOT.cityId) as IdentityRow|undefined;
    if(!row||row.status!=="active")throw new Error("Madeira legacy entitlement requires the imported active public identity.");
    const challenge=madeiraManagedActivationChallengeSchema.parse(JSON.parse(row.challenge));
    verifyMadeiraManagedActivationProof(JSON.parse(row.owner_proof) as Event,challenge,"owner",now,true);
    verifyMadeiraManagedActivationProof(JSON.parse(row.admin_proof) as Event,challenge,"admin",now,true);
    const expected=createHash("sha256").update([row.challenge,row.owner_proof,row.admin_proof,row.activation_request,row.activation_proof,row.activation_config].join("\n")).digest("hex");
    if(row.evidence_hash!==expected)throw new Error("Madeira imported public-identity evidence changed.");
    return {challenge,evidenceHash:row.evidence_hash,source:"madeira-production-public-identity-v1"};
  }
  throw new Error("Madeira signed activation evidence is unavailable.");
}

function evidence(db:DatabaseSync,now=Math.floor(Date.now()/1000)){
  const signed=signedEvidence(db,now),active=activation(db),initial=signed.challenge.activation;
  if(active.row.request!==signed.challenge.requestId||initial.cityId!==active.config.cityId||initial.brandPubkey!==active.config.brandPubkey||
    initial.domain!==active.config.domain||initial.localPart!==active.config.localPart||initial.organizerBasisPoints!==active.config.organizerBasisPoints||
    initial.retainedBasisPoints!==active.config.retainedBasisPoints||active.config.payoutVersion<initial.payoutVersion)
    throw new Error("Madeira active service no longer descends from the signed legacy activation.");
  const registration=table(db,"registration_payout_version")?db.prepare(`SELECT city_id,revision_id,version,owner_pubkey,normalized,endpoint,callback,min_sendable,max_sendable,owner_event_id,owner_event,confirmed_at FROM registration_payout_version
    WHERE city_id=? AND version=?`).get(MADEIRA_PILOT.cityId,initial.payoutVersion) as RegistrationRow|undefined:undefined;
  if(!registration||registration.owner_pubkey!==MADEIRA_PILOT.pubkey||registration.normalized!==initial.payoutDestination)
    throw new Error("Madeira signed registration payout evidence is incomplete.");
  const ownerEvent=JSON.parse(registration.owner_event) as Event;let command:{action?:unknown;cityId?:unknown;revisionId?:unknown;payoutDestination?:unknown}={};
  try{command=JSON.parse(ownerEvent.content);}catch{throw new Error("Madeira registration payout signature is invalid.");}
  if(ownerEvent.id!==registration.owner_event_id||ownerEvent.pubkey!==registration.owner_pubkey||ownerEvent.kind!==27235||getEventHash(ownerEvent)!==ownerEvent.id||!verifyEvent(ownerEvent)||
    command.action!=="create"||command.cityId!==registration.city_id||command.revisionId!==registration.revision_id||command.payoutDestination!==registration.normalized)
    throw new Error("Madeira registration payout signature is invalid.");
  return {...signed,registrationVersion:registration.version,owner:MADEIRA_PILOT.pubkey,brandPubkey:initial.brandPubkey,registration};
}

export function initializeLegacyProEntitlements(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS legacy_pro_entitlement(
  cityId TEXT PRIMARY KEY,entitlementId TEXT NOT NULL UNIQUE,originalOwnerPubkey TEXT NOT NULL,brandPubkey TEXT NOT NULL,
  registrationVersion INTEGER NOT NULL,evidenceHash TEXT NOT NULL UNIQUE,source TEXT NOT NULL,createdAt INTEGER NOT NULL);`);}

export function verifyMadeiraLegacyProEntitlement(db:DatabaseSync,now=Math.floor(Date.now()/1000)){
  const checked=evidence(db,now);
  return {cityId:MADEIRA_PILOT.cityId,entitlementId:`legacy-madeira:${checked.evidenceHash}`,originalOwnerPubkey:checked.owner,
    brandPubkey:checked.brandPubkey,registrationVersion:checked.registrationVersion,evidenceHash:checked.evidenceHash,source:checked.source} satisfies StoredRow;
}

/** Explicit operator migration for the historical Madeira activation. This is
 * an entitlement authority, not a settlement claim, and never creates an invoice. */
export function installMadeiraLegacyProEntitlement(db:DatabaseSync,now=Math.floor(Date.now()/1000)){
  const checked=evidence(db,now),candidate={cityId:MADEIRA_PILOT.cityId,entitlementId:`legacy-madeira:${checked.evidenceHash}`,originalOwnerPubkey:checked.owner,
    brandPubkey:checked.brandPubkey,registrationVersion:checked.registrationVersion,evidenceHash:checked.evidenceHash,source:checked.source} satisfies StoredRow,entitlementId=candidate.entitlementId;
  initializeLegacyProEntitlements(db);
  const existing=db.prepare("SELECT cityId,entitlementId,originalOwnerPubkey,brandPubkey,registrationVersion,evidenceHash,source FROM legacy_pro_entitlement WHERE cityId=? OR entitlementId=?").all(MADEIRA_PILOT.cityId,entitlementId) as StoredRow[];
  if(existing.length&&(existing.length!==1||JSON.stringify(existing[0])!==JSON.stringify(candidate)))throw new Error("Existing Madeira legacy entitlement differs; no record changed.");
  db.exec(`CREATE TABLE IF NOT EXISTS payout_destination_version (
    city_id TEXT NOT NULL,version INTEGER NOT NULL,owner_pubkey TEXT NOT NULL,normalized TEXT NOT NULL,
    endpoint TEXT NOT NULL,callback TEXT NOT NULL,min_sendable INTEGER NOT NULL,max_sendable INTEGER NOT NULL,
    authority TEXT NOT NULL,owner_event_id TEXT NOT NULL,owner_event TEXT NOT NULL,confirmed_at INTEGER NOT NULL,
    PRIMARY KEY(city_id,version),UNIQUE(city_id,owner_event_id));`);
  const payout=db.prepare("SELECT city_id,version,owner_pubkey,normalized,endpoint,callback,min_sendable,max_sendable,owner_event_id,owner_event,confirmed_at FROM payout_destination_version WHERE city_id=? AND version=?").get(candidate.cityId,candidate.registrationVersion) as Omit<RegistrationRow,"revision_id">|undefined;
  const expected={city_id:checked.registration.city_id,version:checked.registration.version,owner_pubkey:checked.registration.owner_pubkey,normalized:checked.registration.normalized,
    endpoint:checked.registration.endpoint,callback:checked.registration.callback,min_sendable:checked.registration.min_sendable,max_sendable:checked.registration.max_sendable,
    owner_event_id:checked.registration.owner_event_id,owner_event:checked.registration.owner_event,confirmed_at:checked.registration.confirmed_at};
  if(payout&&JSON.stringify(payout)!==JSON.stringify(expected))throw new Error("Existing Madeira payout version differs from signed registration evidence.");
  if(!existing.length)db.prepare("INSERT INTO legacy_pro_entitlement VALUES(?,?,?,?,?,?,?,?)").run(candidate.cityId,candidate.entitlementId,candidate.originalOwnerPubkey,candidate.brandPubkey,candidate.registrationVersion,candidate.evidenceHash,candidate.source,now);
  if(!payout)db.prepare("INSERT INTO payout_destination_version VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(expected.city_id,expected.version,expected.owner_pubkey,expected.normalized,expected.endpoint,expected.callback,expected.min_sendable,expected.max_sendable,
    JSON.stringify({kind:"operator-confirmed-legacy-activation",entitlementId:candidate.entitlementId,evidenceHash:candidate.evidenceHash}),expected.owner_event_id,expected.owner_event,expected.confirmed_at);
  return {created:!existing.length,entitlement:candidate,payoutMigrated:!payout};
}

export function legacyProEntitlement(db:DatabaseSync,cityId:string,now=Math.floor(Date.now()/1000)):LegacyProEntitlement|undefined{
  if(cityId!==MADEIRA_PILOT.cityId||!table(db,"legacy_pro_entitlement"))return;
  const row=db.prepare("SELECT cityId,entitlementId,originalOwnerPubkey,brandPubkey,registrationVersion,evidenceHash,source FROM legacy_pro_entitlement WHERE cityId=?").get(cityId) as StoredRow|undefined;
  if(!row)return;
  const checked=evidence(db,now);
  if(row.evidenceHash!==checked.evidenceHash||row.originalOwnerPubkey!==checked.owner||row.brandPubkey!==checked.brandPubkey||row.registrationVersion!==checked.registrationVersion||row.source!==checked.source)
    throw new Error("Madeira legacy entitlement evidence changed; operator review is required.");
  return {invoiceId:row.entitlementId,owner:row.originalOwnerPubkey,brandPubkey:row.brandPubkey,registrationVersion:row.registrationVersion,legacy:true};
}
