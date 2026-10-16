import {DatabaseSync} from "node:sqlite";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("../nostr/madeira-pilot-policy",async original=>{const real=await original<typeof import("../nostr/madeira-pilot-policy")>();return {MADEIRA_PILOT:{...real.MADEIRA_PILOT,pubkey:getPublicKey(new Uint8Array(32).fill(2))}};});
vi.mock("../nostr/authority",async()=>({SUPER_ADMIN_PUBKEY:(await import("nostr-tools")).getPublicKey(new Uint8Array(32).fill(1))}));
import {MADEIRA_PILOT} from "../nostr/madeira-pilot";
import {madeiraManagedActivationProofTemplate,type MadeiraManagedActivationChallenge} from "../nostr/madeira-managed-activation";
import {createCityActivation} from "../rustress/activation-contract";
import type {ProvisionConfig} from "../rustress/contract";
import {installMadeiraLegacyProEntitlement,legacyProEntitlement,verifyMadeiraLegacyProEntitlement} from "./legacy-pro-entitlement";

const databases:DatabaseSync[]=[],owner=new Uint8Array(32).fill(2),admin=new Uint8Array(32).fill(1);
afterEach(()=>databases.splice(0).forEach(db=>db.close()));
function fixture(){
 const db=new DatabaseSync(":memory:");databases.push(db);
 const reserved={cityId:MADEIRA_PILOT.cityId,version:1,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:MADEIRA_PILOT.pubkey,
  authorityEventId:"a".repeat(64),approvalEventId:"b".repeat(64),brandEventId:"c".repeat(64),payoutVersion:1,payoutDestination:"owner@example.org",
  walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"} satisfies ProvisionConfig;
 const activation=createCityActivation(reserved),challenge:MadeiraManagedActivationChallenge={scope:"madeira-managed-public-activation-v1",cityId:MADEIRA_PILOT.cityId,
  pubkey:MADEIRA_PILOT.pubkey,origin:MADEIRA_PILOT.origin,publicOrigin:"https://bitcoinwalk.org",requestId:"00000000-0000-4000-8000-000000000002",
  reservationRequestId:"00000000-0000-4000-8000-000000000003",reservationProofHash:"d".repeat(64),issuedAt:1000,expiresAt:4600,
  providerRevision:"e".repeat(64),nip05:"madeira@bitcoinwalk.org",lightningAddress:"madeira@bitcoinwalk.org",publicActivation:true,
  organizerBasisPoints:7900,retainedBasisPoints:2100,reserved,activation};
 const ownerProof=finalizeEvent(madeiraManagedActivationProofTemplate(challenge,"owner"),owner),adminProof=finalizeEvent(madeiraManagedActivationProofTemplate(challenge,"admin"),admin);
 db.exec(`CREATE TABLE madeira_managed_activation(singleton INTEGER PRIMARY KEY,id TEXT,challenge TEXT,owner TEXT,admin TEXT);
 CREATE TABLE rustress_activation_task(city TEXT PRIMARY KEY,request TEXT,reserved_config TEXT,activation_config TEXT,proof TEXT,public_origin TEXT,phase TEXT,nip05 TEXT,lnurl TEXT,lease TEXT,until INTEGER,updated_at INTEGER);
 CREATE TABLE registration_payout_version(city_id TEXT,revision_id TEXT,version INTEGER,owner_pubkey TEXT,normalized TEXT,endpoint TEXT,callback TEXT,min_sendable INTEGER,max_sendable INTEGER,owner_event_id TEXT,owner_event TEXT,confirmed_at INTEGER);`);
 db.prepare("INSERT INTO madeira_managed_activation VALUES(1,?,?,?,?)").run(challenge.requestId,JSON.stringify(challenge),JSON.stringify(ownerProof),JSON.stringify(adminProof));
 db.prepare("INSERT INTO rustress_activation_task VALUES(?,?,?,?,?,'https://bitcoinwalk.org','active','active','active',NULL,0,1)").run(MADEIRA_PILOT.cityId,challenge.requestId,JSON.stringify(reserved),JSON.stringify(activation),"f".repeat(64));
 const revisionId="9".repeat(64),registrationEvent=finalizeEvent({kind:27235,created_at:1000,tags:[],content:JSON.stringify({action:"create",cityId:MADEIRA_PILOT.cityId,revisionId,payoutDestination:"owner@example.org"})},owner);
 db.prepare("INSERT INTO registration_payout_version VALUES(?,?,1,?,?,?,?,?,?,?,?,?)").run(MADEIRA_PILOT.cityId,revisionId,MADEIRA_PILOT.pubkey,"owner@example.org","https://example.org/.well-known/lnurlp/owner","https://example.org/callback",1000,1000000,registrationEvent.id,JSON.stringify(registrationEvent),1000);
 return {db,challenge};
}

describe("operator-confirmed Madeira legacy Pro entitlement",()=>{
 it("installs an idempotent non-payment authority from exact signed activation evidence",()=>{const {db}=fixture();
  const verified=verifyMadeiraLegacyProEntitlement(db,2000);expect(verified).toMatchObject({cityId:MADEIRA_PILOT.cityId,originalOwnerPubkey:MADEIRA_PILOT.pubkey,registrationVersion:1});
  expect(verified.entitlementId).toMatch(/^legacy-madeira:[0-9a-f]{64}$/);
  expect(installMadeiraLegacyProEntitlement(db,2000).created).toBe(true);expect(installMadeiraLegacyProEntitlement(db,2000).created).toBe(false);
  expect(legacyProEntitlement(db,MADEIRA_PILOT.cityId,2000)).toMatchObject({invoiceId:verified.entitlementId,owner:MADEIRA_PILOT.pubkey,brandPubkey:MADEIRA_PILOT.pubkey,registrationVersion:1,legacy:true});
  expect(db.prepare("SELECT version,normalized FROM payout_destination_version WHERE city_id=?").get(MADEIRA_PILOT.cityId)).toEqual({version:1,normalized:"owner@example.org"});
  expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='payment_invoice'").get()).toBeUndefined();
 });
 it("fails closed when the active 79/21 service record is changed",()=>{const {db}=fixture();installMadeiraLegacyProEntitlement(db,2000);
  const row=db.prepare("SELECT activation_config FROM rustress_activation_task WHERE city=?").get(MADEIRA_PILOT.cityId) as {activation_config:string};
  db.prepare("UPDATE rustress_activation_task SET activation_config=? WHERE city=?").run(JSON.stringify({...JSON.parse(row.activation_config),organizerBasisPoints:7800,retainedBasisPoints:2200}),MADEIRA_PILOT.cityId);
  expect(()=>legacyProEntitlement(db,MADEIRA_PILOT.cityId,2000)).toThrow();
 });
});
