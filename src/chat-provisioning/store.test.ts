import {DatabaseSync} from "node:sqlite";
import {describe,expect,it} from "vitest";
import {ChatProvisionStore} from "./store";

const cityId="ca2f9905-fb4d-4948-a12c-c792b28ec7c8",entitlement="invoice-london",metadata="a".repeat(64);
function setup(){const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT,paymentHash TEXT UNIQUE,invoiceId TEXT,paidAt INTEGER); INSERT INTO paid_city_entitlement VALUES('"+cityId+"','owner','"+"b".repeat(64)+"','"+entitlement+"',1)");return {db,store:new ChatProvisionStore(db)};}

describe("paid chat provisioning registry",()=>{
 it("binds an exact paid city destination and activates only verified evidence",()=>{const {store}=setup();
  expect(store.propose({cityId,slug:"london",groupId:"london-community"},10)).toMatchObject({relay:"wss://london.bitcoinwalk.org/",phase:"candidate",entitlementId:entitlement});
  expect(()=>store.activate(cityId,"c".repeat(64),11)).toThrow("Fresh verified");
  const verified=store.verify(cityId,{metadataEventId:metadata,publiclyReadable:true,openJoin:true},12);expect(verified).toMatchObject({phase:"verified",metadataEventId:metadata});
  expect(store.activate(cityId,verified.evidenceDigest!,13)).toMatchObject({phase:"active",activatedAt:13});
 });
 it("rejects unpaid cities, unsafe identifiers and group reuse",()=>{const {db,store}=setup();
  expect(()=>store.propose({cityId:"91a846c2-b57a-4442-904b-167fb8b98dd6",slug:"seattle",groupId:"group"})).toThrow("settled Pro");
  expect(()=>store.propose({cityId,slug:"London",groupId:"group"})).toThrow("valid paid city");
  store.propose({cityId,slug:"london",groupId:"group"});db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run("8e136ccb-923b-41aa-a6d1-1290b0b3a014","owner2","c".repeat(64),"invoice2",2);
  expect(()=>store.propose({cityId:"8e136ccb-923b-41aa-a6d1-1290b0b3a014",slug:"london",groupId:"group"})).toThrow();
  expect(()=>store.propose({cityId:"8e136ccb-923b-41aa-a6d1-1290b0b3a014",slug:"wuerzburg",groupId:"group"})).not.toThrow();
 });
 it("does not silently replace an active destination",()=>{const {store}=setup();store.propose({cityId,slug:"london",groupId:"one"});const verified=store.verify(cityId,{metadataEventId:metadata,publiclyReadable:true,openJoin:true});store.activate(cityId,verified.evidenceDigest!);expect(()=>store.propose({cityId,slug:"london",groupId:"two"})).toThrow("explicit revocation");});
 it("fails closed when group visibility or entitlement changes",()=>{const {db,store}=setup();store.propose({cityId,slug:"london",groupId:"group"});expect(()=>store.verify(cityId,{metadataEventId:metadata,publiclyReadable:false,openJoin:true})).toThrow("publicly readable");db.prepare("UPDATE paid_city_entitlement SET invoiceId='changed' WHERE cityId=?").run(cityId);expect(()=>store.verify(cityId,{metadataEventId:metadata,publiclyReadable:true,openJoin:true})).toThrow("entitlement changed");});
});
