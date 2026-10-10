import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {MADEIRA_PILOT} from "../nostr/madeira-pilot";
import {madeiraManagedActivationChallengeSchema,verifyMadeiraManagedActivationProof} from "../nostr/madeira-managed-activation";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";

export type PublicIdentity={domain:string;localPart:string;brandPubkey:string};
type GrantRow={challenge:string;owner:string|null;admin:string|null};
type TaskRow={city:string;request:string;reserved_config:string;activation_config:string;proof:string;public_origin:string;phase:string;nip05:string};
type IdentityRow={local_part:string;domain:string;brand_pubkey:string;evidence_hash:string;source_city:string;challenge:string;owner_proof:string;admin_proof:string;activation_config:string;activation_request:string;activation_proof:string;status:string};

export function initializePublicIdentityStore(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS rustress_public_identity (
  local_part TEXT PRIMARY KEY,domain TEXT NOT NULL,brand_pubkey TEXT NOT NULL,evidence_hash TEXT NOT NULL UNIQUE,
  source_city TEXT NOT NULL UNIQUE,challenge TEXT NOT NULL,owner_proof TEXT NOT NULL,admin_proof TEXT NOT NULL,
  activation_config TEXT NOT NULL,activation_request TEXT NOT NULL,activation_proof TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),updated_at INTEGER NOT NULL);`);}

export function activePublicIdentity(db:DatabaseSync,localPart:string):PublicIdentity|null{
  const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rustress_public_identity'").get();if(!table)return null;
  const row=db.prepare("SELECT domain,local_part,brand_pubkey FROM rustress_public_identity WHERE local_part=? AND status='active'").get(localPart) as {domain:string;local_part:string;brand_pubkey:string}|undefined;
  if(!row||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.local_part)||row.local_part.length>63||
    !/^[a-z0-9.-]+$/.test(row.domain)||row.domain.length>253||!/^[0-9a-f]{64}$/.test(row.brand_pubkey))return null;
  return {domain:row.domain,localPart:row.local_part,brandPubkey:row.brand_pubkey};
}

export function initializeRootIdentityStore(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS nostr_root_identity (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),domain TEXT NOT NULL,brand_pubkey TEXT NOT NULL,
  authority TEXT NOT NULL,evidence_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  updated_at INTEGER NOT NULL);`);}

export function activeRootIdentity(db:DatabaseSync):PublicIdentity|null{
  const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='nostr_root_identity'").get();if(!table)return null;
  const row=db.prepare("SELECT domain,brand_pubkey,authority FROM nostr_root_identity WHERE singleton=1 AND status='active'").get() as {domain:string;brand_pubkey:string;authority:string}|undefined;
  if(!row||row.domain!=="bitcoinwalk.org"||row.brand_pubkey!==SUPER_ADMIN_PUBKEY||row.authority!=="bitcoinwalk-super-admin-v1")return null;
  return {domain:row.domain,localPart:"_",brandPubkey:row.brand_pubkey};
}

/** Installs the root-domain identity controlled by the already configured
 * BitcoinWalk super-admin. It does not provision an LNURL or wallet route. */
export function installSuperAdminRootIdentity(db:DatabaseSync,now=Math.floor(Date.now()/1000)){
  const domain="bitcoinwalk.org",authority="bitcoinwalk-super-admin-v1",evidenceHash=createHash("sha256").update(`${authority}\n${domain}\n_\n${SUPER_ADMIN_PUBKEY}`).digest("hex");
  initializeRootIdentityStore(db);
  const existing=db.prepare("SELECT domain,brand_pubkey,authority,evidence_hash,status FROM nostr_root_identity WHERE singleton=1").get() as {domain:string;brand_pubkey:string;authority:string;evidence_hash:string;status:string}|undefined;
  const exact=existing?.domain===domain&&existing.brand_pubkey===SUPER_ADMIN_PUBKEY&&existing.authority===authority&&existing.evidence_hash===evidenceHash&&existing.status==="active";
  if(existing&&!exact)throw new Error("Existing root NIP-05 identity differs; no record changed.");
  if(!existing)db.prepare("INSERT INTO nostr_root_identity VALUES(1,?,?,?,?,'active',?)").run(domain,SUPER_ADMIN_PUBKEY,authority,evidenceHash,now);
  return {created:!existing,identity:activeRootIdentity(db),evidenceHash};
}

export function initializeNamedIdentityStore(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS nostr_named_identity (
  local_part TEXT PRIMARY KEY,domain TEXT NOT NULL,brand_pubkey TEXT NOT NULL,
  authority TEXT NOT NULL,evidence_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  updated_at INTEGER NOT NULL);`);}

/** Returns an explicitly authorized personal or organizational NIP-05 binding.
 * It is intentionally independent from Lightning and city provisioning. */
export function activeNamedIdentity(db:DatabaseSync,localPart:string):PublicIdentity|null{
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(localPart)||localPart.length>63)return null;
  const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='nostr_named_identity'").get();if(!table)return null;
  const row=db.prepare("SELECT domain,local_part,brand_pubkey,authority FROM nostr_named_identity WHERE local_part=? AND status='active'").get(localPart) as {domain:string;local_part:string;brand_pubkey:string;authority:string}|undefined;
  if(!row||row.domain!=="bitcoinwalk.org"||row.authority!=="bitcoinwalk-super-admin-v1"||!/^[0-9a-f]{64}$/.test(row.brand_pubkey))return null;
  return {domain:row.domain,localPart:row.local_part,brandPubkey:row.brand_pubkey};
}

/** Installs one exact named NIP-05 binding under the configured BitcoinWalk
 * super-admin authority. Existing records are immutable unless they match. */
export function installNamedIdentity(db:DatabaseSync,localPart:string,brandPubkey:string,now=Math.floor(Date.now()/1000)){
  const domain="bitcoinwalk.org",authority="bitcoinwalk-super-admin-v1";
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(localPart)||localPart.length>63||!/^[0-9a-f]{64}$/.test(brandPubkey))throw new Error("Named NIP-05 identity is invalid.");
  initializeNamedIdentityStore(db);
  const evidenceHash=createHash("sha256").update(`${authority}\n${domain}\n${localPart}\n${brandPubkey}`).digest("hex");
  const existing=db.prepare("SELECT domain,brand_pubkey,authority,evidence_hash,status FROM nostr_named_identity WHERE local_part=?").get(localPart) as {domain:string;brand_pubkey:string;authority:string;evidence_hash:string;status:string}|undefined;
  const exact=existing?.domain===domain&&existing.brand_pubkey===brandPubkey&&existing.authority===authority&&existing.evidence_hash===evidenceHash&&existing.status==="active";
  if(existing&&!exact)throw new Error("Existing named NIP-05 identity differs; no record changed.");
  if(!existing)db.prepare("INSERT INTO nostr_named_identity VALUES(?,?,?,?,?,'active',?)").run(localPart,domain,brandPubkey,authority,evidenceHash,now);
  return {created:!existing,identity:activeNamedIdentity(db,localPart),evidenceHash};
}

/** Copies only the already-authorized NIP-05 binding. No activation task,
 * Lightning route, payout destination or wallet capability is imported. */
export function importMadeiraPublicIdentity(source:DatabaseSync,target:DatabaseSync,now=Math.floor(Date.now()/1000)){
  const grant=source.prepare("SELECT challenge,owner,admin FROM madeira_managed_activation WHERE singleton=1").get() as GrantRow|undefined;
  if(!grant?.owner||!grant.admin)throw new Error("Madeira identity import requires both saved activation proofs.");
  const challenge=madeiraManagedActivationChallengeSchema.parse(JSON.parse(grant.challenge));
  verifyMadeiraManagedActivationProof(JSON.parse(grant.owner) as Event,challenge,"owner",now,true);
  verifyMadeiraManagedActivationProof(JSON.parse(grant.admin) as Event,challenge,"admin",now,true);
  const task=source.prepare("SELECT city,request,reserved_config,activation_config,proof,public_origin,phase,nip05 FROM rustress_activation_task WHERE city=?").get(MADEIRA_PILOT.cityId) as TaskRow|undefined;
  if(!task||task.request!==challenge.requestId||task.city!==challenge.cityId||task.public_origin!==challenge.publicOrigin||task.phase!=="active"||task.nip05!=="active"||
    task.reserved_config!==JSON.stringify(challenge.reserved)||task.activation_config!==JSON.stringify(challenge.activation)||!/^[0-9a-f]{64}$/.test(task.proof))
    throw new Error("Madeira identity import requires the exact active NIP-05 read-back.");
  const evidenceHash=createHash("sha256").update([grant.challenge,grant.owner,grant.admin,task.request,task.proof,task.activation_config].join("\n")).digest("hex");
  initializePublicIdentityStore(target);
  const candidate:IdentityRow={local_part:challenge.activation.localPart,domain:challenge.activation.domain,brand_pubkey:challenge.activation.brandPubkey,
    evidence_hash:evidenceHash,source_city:challenge.cityId,challenge:grant.challenge,owner_proof:grant.owner,admin_proof:grant.admin,
    activation_config:task.activation_config,activation_request:task.request,activation_proof:task.proof,status:"active"};
  const existing=target.prepare("SELECT local_part,domain,brand_pubkey,evidence_hash,source_city,challenge,owner_proof,admin_proof,activation_config,activation_request,activation_proof,status FROM rustress_public_identity WHERE local_part=? OR source_city=? LIMIT 2")
    .all(candidate.local_part,candidate.source_city) as IdentityRow[];
  if(existing.length){if(existing.length===1&&JSON.stringify(existing[0])===JSON.stringify(candidate))return {created:false,identity:activePublicIdentity(target,candidate.local_part),evidenceHash};
    throw new Error("Production NIP-05 identity differs from the signed Madeira evidence; no record changed.");}
  target.exec("BEGIN IMMEDIATE");
  try{target.prepare("INSERT INTO rustress_public_identity(local_part,domain,brand_pubkey,evidence_hash,source_city,challenge,owner_proof,admin_proof,activation_config,activation_request,activation_proof,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'active',?)")
    .run(candidate.local_part,candidate.domain,candidate.brand_pubkey,candidate.evidence_hash,candidate.source_city,candidate.challenge,candidate.owner_proof,candidate.admin_proof,candidate.activation_config,candidate.activation_request,candidate.activation_proof,now);
    target.exec("COMMIT");}catch(error){target.exec("ROLLBACK");throw error;}
  return {created:true,identity:activePublicIdentity(target,candidate.local_part),evidenceHash};
}
