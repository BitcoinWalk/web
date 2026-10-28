import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {PaymentStore} from "./service";
import {organizerProCityIds,organizerProNextActions} from "./organizer-pro-next-action";

const owner="a".repeat(64),now=2_000_000_000;
const paidCity="00000000-0000-4000-8000-000000000011";
const giftCity="00000000-0000-4000-8000-000000000012";
const adminCity="00000000-0000-4000-8000-000000000013";
const legacyCity="00000000-0000-4000-8000-000000000014";
const directories:string[]=[];

afterEach(()=>directories.splice(0).forEach(directory=>rmSync(directory,{recursive:true,force:true})));

function insertDurableEntry(store:PaymentStore,input:{cityId:string;name:string;id:string;hash:string;source:"checkout-v1"|"admin-pro-promotion-v1";giftToken?:string}){
 store.db.prepare(`INSERT INTO payment_invoice(id,cityId,owner,cityName,revisionId,invoice,paymentHash,amountMsat,createdAt,expiresAt,status,settledAt,checkedAt,source)
  VALUES(?,?,?,?,?,'',?,21000000,?,0,'paid',?,?,?)`).run(input.id,input.cityId,owner,input.name,"b".repeat(64),input.hash,now-20,now-10,now-5,input.source);
 store.db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(input.cityId,owner,input.hash,input.id,now-10);
 store.db.prepare(`INSERT INTO pro_setup_task(cityId,entitlementId,originalOwnerPubkey,currentOwnerPubkey,state,createdAt,updatedAt)
  VALUES(?,?,?,?,'setup-required',?,?)`).run(input.cityId,input.id,owner,owner,now-10,now-10);
 if(input.giftToken)store.db.prepare("INSERT INTO gift_city_checkout VALUES(?,?,?,?)").run(input.giftToken,input.cityId,input.id,now-20);
}

describe("BW-155 resumable onboarding boundary",()=>{
 it("reopens paid, gifted, administrative and legacy entitlements without duplicating money or setup work",()=>{
  const directory=mkdtempSync(join(tmpdir(),"bw-155-"));directories.push(directory);const path=join(directory,"payments.sqlite");
  let store=new PaymentStore(path);
  insertDurableEntry(store,{cityId:paidCity,name:"Paid",id:"paid-order",hash:"1".repeat(64),source:"checkout-v1"});
  insertDurableEntry(store,{cityId:giftCity,name:"Gifted",id:"gift-order",hash:"2".repeat(64),source:"checkout-v1",giftToken:"f".repeat(64)});
  insertDurableEntry(store,{cityId:adminCity,name:"Administrative",id:"admin-order",hash:"3".repeat(64),source:"admin-pro-promotion-v1"});
  store.db.exec(`CREATE TABLE legacy_pro_entitlement(cityId TEXT PRIMARY KEY,entitlementId TEXT UNIQUE,originalOwnerPubkey TEXT,brandPubkey TEXT,registrationVersion INTEGER,evidenceHash TEXT UNIQUE,source TEXT,createdAt INTEGER)`);
  store.db.prepare("INSERT INTO legacy_pro_entitlement VALUES(?,?,?,?,1,?,?,?)").run(legacyCity,"legacy:evidence",owner,"c".repeat(64),"4".repeat(64),"verified-legacy-fixture",now-30);
  const before={invoices:store.db.prepare("SELECT COUNT(*) count FROM payment_invoice").get(),entitlements:store.db.prepare("SELECT COUNT(*) count FROM paid_city_entitlement").get(),tasks:store.db.prepare("SELECT COUNT(*) count FROM pro_setup_task").get()};
  store.db.close();

  store=new PaymentStore(path);
  expect(organizerProCityIds(store.db,owner)).toEqual([paidCity,giftCity,adminCity,legacyCity]);
  expect(organizerProNextActions(store.db,owner,now)).toEqual([
   {cityId:paidCity,cityName:"Paid",state:"confirm-payout"},
   {cityId:giftCity,cityName:"Gifted",state:"confirm-payout"},
   {cityId:adminCity,cityName:"Administrative",state:"confirm-payout"},
  ]);
  expect(store.db.prepare("SELECT COUNT(*) count FROM payment_invoice").get()).toEqual(before.invoices);
  expect(store.db.prepare("SELECT COUNT(*) count FROM paid_city_entitlement").get()).toEqual(before.entitlements);
  expect(store.db.prepare("SELECT COUNT(*) count FROM pro_setup_task").get()).toEqual(before.tasks);
  expect(store.db.prepare("SELECT source FROM payment_invoice WHERE cityId=?").get(adminCity)).toEqual({source:"admin-pro-promotion-v1"});
  expect(store.db.prepare("SELECT invoiceId FROM gift_city_checkout WHERE cityId=?").get(giftCity)).toEqual({invoiceId:"gift-order"});
  expect(store.db.prepare("SELECT entitlementId FROM legacy_pro_entitlement WHERE cityId=?").get(legacyCity)).toEqual({entitlementId:"legacy:evidence"});
  store.db.close();
 });
});
