import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {finalizeEvent,getPublicKey,generateSecretKey} from "nostr-tools";
import {afterEach,expect,it} from "vitest";
import {importSettledCityEntitlement} from "./production-entitlement-import";

const dbs:DatabaseSync[]=[];afterEach(()=>{for(const db of dbs.splice(0))db.close();});
const cityId="e62592ac-a5fc-42df-8f31-94416f6ee8d5",revisionId="e".repeat(64),invoiceId="invoice",hash="a".repeat(64),now=2_000_000_000;
function database(){const db=new DatabaseSync(":memory:");dbs.push(db);db.exec(`
 CREATE TABLE payment_invoice(id TEXT PRIMARY KEY,cityId TEXT,owner TEXT,cityName TEXT,revisionId TEXT,invoice TEXT,paymentHash TEXT,amountMsat INTEGER,createdAt INTEGER,expiresAt INTEGER,status TEXT,settledAt INTEGER,checkedAt INTEGER);
 CREATE TABLE payment_invoice_payout(invoiceId TEXT PRIMARY KEY,destinationVersion INTEGER);
 CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT,paymentHash TEXT,invoiceId TEXT,paidAt INTEGER);
 CREATE TABLE registration_payout_version(city_id TEXT,revision_id TEXT,version INTEGER,owner_pubkey TEXT,normalized TEXT,endpoint TEXT,callback TEXT,min_sendable INTEGER,max_sendable INTEGER,owner_event_id TEXT,owner_event TEXT,confirmed_at INTEGER);
 CREATE TABLE pro_setup_task(cityId TEXT PRIMARY KEY,entitlementId TEXT,originalOwnerPubkey TEXT,currentOwnerPubkey TEXT,registrationVersion INTEGER,payoutVersion INTEGER,brandPubkey TEXT,brandVersion INTEGER,backupAcknowledgedAt INTEGER,artworkRevisionId TEXT,artworkAvatar TEXT,artworkBanner TEXT,artworkVersion INTEGER,state TEXT,createdAt INTEGER,updatedAt INTEGER);`);return db;}
function fixture(){const source=database(),target=database(),key=generateSecretKey(),owner=getPublicKey(key),destination="owner@example.com";
 const event=finalizeEvent({kind:27235,created_at:now-20,tags:[],content:JSON.stringify({action:"create",cityId,revisionId,payoutDestination:destination})},key);
 source.prepare("INSERT INTO payment_invoice VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(invoiceId,cityId,owner,"Graz",revisionId,"lnbc",hash,21_000_000,now-30,now+3000,"paid",now-10,now-5);
 source.prepare("INSERT INTO registration_payout_version VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(cityId,revisionId,1,owner,destination,"https://example.com/.well-known/lnurlp/owner","https://example.com/callback",1000,100000000,event.id,JSON.stringify(event),now-20);
 source.prepare("INSERT INTO payment_invoice_payout VALUES(?,?)").run(invoiceId,1);source.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,owner,hash,invoiceId,now-10);
 source.prepare("INSERT INTO pro_setup_task VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(cityId,invoiceId,owner,owner,1,null,null,0,null,null,null,null,0,"setup-required",now-10,now-10);
 return {source,target,expected:{cityId,owner,revisionId,invoiceId,amountMsat:21_000_000}};}
it("verifies, atomically imports and exactly retries a pristine settled entitlement",()=>{const f=fixture();expect(importSettledCityEntitlement(f.source,f.target,f.expected,false).created).toBe(true);
 f.target.exec("BEGIN");expect(importSettledCityEntitlement(f.source,f.target,f.expected,true).created).toBe(true);f.target.exec("COMMIT");
 expect(importSettledCityEntitlement(f.source,f.target,f.expected,false).created).toBe(false);expect(f.target.prepare("SELECT state FROM pro_setup_task WHERE cityId=?").get(cityId)).toEqual({state:"setup-required"});});
it("rejects partial collisions and setup that has progressed",()=>{const f=fixture();f.target.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,f.expected.owner,hash,invoiceId,now-10);
 expect(()=>importSettledCityEntitlement(f.source,f.target,f.expected,false)).toThrow("conflicting");f.target.prepare("DELETE FROM paid_city_entitlement").run();f.source.prepare("UPDATE pro_setup_task SET brandVersion=1 WHERE cityId=?").run(cityId);
 expect(()=>importSettledCityEntitlement(f.source,f.target,f.expected,false)).toThrow("no longer pristine");});
it("ships a non-root, backup-first and rollback-safe production installer",()=>{const script=readFileSync("deploy/import-graz-production-entitlement-0.3.272.sh","utf8");
 for(const value of ["Run as bitcoinwalk, not root","sha256sum -c","--verify-only","backup-sqlite-online.mjs","systemctl --user stop","payments.before.sqlite","GRAZ_ENTITLEMENT_IMPORT_OK created=true","https://bitcoinwalk.org/graz"])expect(script).toContain(value);
 expect(script).not.toContain("sudo ");});
