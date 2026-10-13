import {DatabaseSync} from "node:sqlite";
import {describe,expect,it} from "vitest";
import {ChatProvisionStore} from "./store";

const cityId="ca2f9905-fb4d-4948-a12c-c792b28ec7c8",entitlement="invoice-london",metadata="a".repeat(64);
function setup(){const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT,paymentHash TEXT UNIQUE,invoiceId TEXT,paidAt INTEGER); INSERT INTO paid_city_entitlement VALUES('"+cityId+"','owner','"+"b".repeat(64)+"','"+entitlement+"',1)");return {db,store:new ChatProvisionStore(db)};}

describe("paid chat provisioning registry",()=>{
 it("adds the public visibility control to an existing registry without hiding active cities",()=>{const db=new DatabaseSync(":memory:");db.exec(`CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT,paymentHash TEXT UNIQUE,invoiceId TEXT,paidAt INTEGER);INSERT INTO paid_city_entitlement VALUES('${cityId}','owner','${"b".repeat(64)}','${entitlement}',1);CREATE TABLE city_chat_provisioning(cityId TEXT PRIMARY KEY,entitlementId TEXT NOT NULL,slug TEXT NOT NULL,relay TEXT NOT NULL,groupId TEXT NOT NULL,phase TEXT NOT NULL,evidenceDigest TEXT,metadataEventId TEXT,verifiedAt INTEGER,activatedAt INTEGER,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,UNIQUE(relay,groupId));INSERT INTO city_chat_provisioning VALUES('${cityId}','${entitlement}','london','wss://london.bitcoinwalk.org/','group','active','${"c".repeat(64)}','${metadata}',1,2,1,2);`);const store=new ChatProvisionStore(db);expect(store.get(cityId)).toMatchObject({phase:"active",publicEnabled:1,publicUpdatedAt:null});expect(store.active()).toHaveLength(1);db.close();});
 it("binds an exact paid city destination and activates only verified evidence",()=>{const {store}=setup();
  expect(store.propose({cityId,slug:"london",groupId:"london-community"},10)).toMatchObject({relay:"wss://london.bitcoinwalk.org/",phase:"candidate",entitlementId:entitlement});
  expect(()=>store.activate(cityId,"c".repeat(64),11)).toThrow("Fresh verified");
  const verified=store.verify(cityId,{metadataEventId:metadata,publiclyReadable:true,openJoin:true},12);expect(verified).toMatchObject({phase:"verified",metadataEventId:metadata});
  expect(store.activate(cityId,verified.evidenceDigest!,13)).toMatchObject({phase:"active",activatedAt:13});
 });
 it("keeps evidence stable when activation rechecks unchanged signed metadata",()=>{const {store}=setup();store.propose({cityId,slug:"london",groupId:"bitcoinwalk-london"},10);const inspection={metadataEventId:metadata,publiclyReadable:true,openJoin:true},first=store.verify(cityId,inspection,11),second=store.verify(cityId,inspection,12);expect(second.evidenceDigest).toBe(first.evidenceDigest);expect(store.activate(cityId,second.evidenceDigest!,13)).toMatchObject({phase:"active",activatedAt:13});});
 it("rejects unpaid cities, unsafe identifiers and group reuse",()=>{const {db,store}=setup();
  expect(()=>store.propose({cityId:"91a846c2-b57a-4442-904b-167fb8b98dd6",slug:"seattle",groupId:"group"})).toThrow("settled Pro");
  expect(()=>store.propose({cityId,slug:"London",groupId:"group"})).toThrow("valid paid city");
  store.propose({cityId,slug:"london",groupId:"group"});db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run("8e136ccb-923b-41aa-a6d1-1290b0b3a014","owner2","c".repeat(64),"invoice2",2);
  expect(()=>store.propose({cityId:"8e136ccb-923b-41aa-a6d1-1290b0b3a014",slug:"london",groupId:"group"})).toThrow();
  expect(()=>store.propose({cityId:"8e136ccb-923b-41aa-a6d1-1290b0b3a014",slug:"wuerzburg",groupId:"group"})).not.toThrow();
 });
 it("does not silently replace an active destination",()=>{const {store}=setup();store.propose({cityId,slug:"london",groupId:"one"});const verified=store.verify(cityId,{metadataEventId:metadata,publiclyReadable:true,openJoin:true});store.activate(cityId,verified.evidenceDigest!);expect(()=>store.propose({cityId,slug:"london",groupId:"two"})).toThrow("explicit revocation");});
 it("lets an active city hide and restore only its public client link",()=>{const {store}=setup();store.propose({cityId,slug:"london",groupId:"one"});const verified=store.verify(cityId,{metadataEventId:metadata,publiclyReadable:true,openJoin:true});store.activate(cityId,verified.evidenceDigest!);expect(store.active()).toHaveLength(1);expect(store.setPublicEnabled(cityId,false,20)).toMatchObject({phase:"active",publicEnabled:0,publicUpdatedAt:20});expect(store.active()).toHaveLength(0);expect(store.setPublicEnabled(cityId,true,21)).toMatchObject({publicEnabled:1,publicUpdatedAt:21});expect(store.active()).toHaveLength(1);});
 it("fails closed when group visibility or entitlement changes",()=>{const {db,store}=setup();store.propose({cityId,slug:"london",groupId:"group"});expect(()=>store.verify(cityId,{metadataEventId:metadata,publiclyReadable:false,openJoin:true})).toThrow("publicly readable");db.prepare("UPDATE paid_city_entitlement SET invoiceId='changed' WHERE cityId=?").run(cityId);expect(()=>store.verify(cityId,{metadataEventId:metadata,publiclyReadable:true,openJoin:true})).toThrow("entitlement changed");});
});
