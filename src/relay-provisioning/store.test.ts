import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it} from "vitest";
import {RelayProvisionStore,REPLICATION_SERVICE_PUBKEY,type RelayProvisionEvidence} from "./store";

const cityId="e62592ac-a5fc-42df-8f31-94416f6ee8d5",revisionId="ab".repeat(32),approvalEventId="cd".repeat(32),paymentHash="ef".repeat(32);
const databases:DatabaseSync[]=[];
function fixture(){const db=new DatabaseSync(":memory:");databases.push(db);db.exec("CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT,paymentHash TEXT,invoiceId TEXT,paidAt INTEGER); INSERT INTO paid_city_entitlement VALUES('"+cityId+"','owner','"+paymentHash+"','invoice',1)");let now=100;return {db,store:new RelayProvisionStore(db,()=>now),advance:(seconds:number)=>now+=seconds};}
afterEach(()=>{while(databases.length)databases.pop()!.close();});
const input={cityId,revisionId,slug:"graz",cityName:"Graz",approvalEventId};
const evidence:RelayProvisionEvidence={containerNonRoot:true,readOnly:true,noPublishedPorts:true,restartStable:true,emptyExact:true,gatewayRouted:true};

describe("paid-city relay provisioning queue",()=>{
 it("queues one exact manifest only after durable entitlement evidence",()=>{const f=fixture(),first=f.store.enqueue(input),again=f.store.enqueue(input);expect(again.evidenceDigest).toBe(first.evidenceDigest);expect(f.store.manifest(first)).toEqual({version:1,cityId,slug:"graz",cityName:"Graz",destination:"wss://graz.bitcoinwalk.org/",approvalEventId,entitlementId:paymentHash,evidenceDigest:first.evidenceDigest,replicationServicePubkey:REPLICATION_SERVICE_PUBKEY});expect(f.db.prepare("SELECT count(*) count FROM city_relay_provision_task").get()).toEqual({count:1});});
 it("rejects absent payment and conflicting approval scope",()=>{const f=fixture();f.db.prepare("DELETE FROM paid_city_entitlement").run();expect(()=>f.store.enqueue(input)).toThrow("verified paid-city entitlement");f.db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,"owner",paymentHash,"invoice",1);f.store.enqueue(input);expect(()=>f.store.enqueue({...input,approvalEventId:"11".repeat(32)})).toThrow("operator review");});
 it("leases durably, reclaims only after expiry and accepts complete evidence",()=>{const f=fixture();f.store.enqueue(input);const leased=f.store.claim(30)!;expect(leased.phase).toBe("leased");expect(f.store.claim()).toBeUndefined();f.advance(31);const reclaimed=f.store.claim()!;expect(reclaimed.attempts).toBe(2);expect(f.store.complete(cityId,reclaimed.evidenceDigest,{phase:"provisioned",evidence})).toMatchObject({phase:"provisioned",evidence});});
 it("fails closed on incomplete or mismatched worker evidence",()=>{const f=fixture(),leased=(f.store.enqueue(input),f.store.claim()!);expect(()=>f.store.complete(cityId,"00".repeat(32),{phase:"provisioned",evidence})).toThrow("does not match");expect(()=>f.store.complete(cityId,leased.evidenceDigest,{phase:"provisioned",evidence:{...evidence,restartStable:false}})).toThrow("Incomplete");expect(f.store.complete(cityId,leased.evidenceDigest,{phase:"needs-attention",failureCode:"apply-failed"})).toMatchObject({phase:"needs-attention",failureCode:"apply-failed"});f.store.retry(cityId);expect(f.store.row(cityId)?.phase).toBe("queued");});
});
