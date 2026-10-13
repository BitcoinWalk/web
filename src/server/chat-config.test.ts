import {DatabaseSync} from "node:sqlite";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {ChatProvisionStore} from "../chat-provisioning/store";

const db=new DatabaseSync(":memory:"),cityId="ca2f9905-fb4d-4948-a12c-c792b28ec7c8";
vi.mock("server-only",()=>({}));
vi.mock("../payments/runtime",()=>({getPaymentRuntime:()=>({store:{db}})}));
describe("server chat configuration",()=>{
 beforeEach(()=>{db.exec("DROP TABLE IF EXISTS city_chat_provisioning; DROP TABLE IF EXISTS paid_city_entitlement; CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT,paymentHash TEXT UNIQUE,invoiceId TEXT,paidAt INTEGER);");});
 it("exposes independent visibility flags only while the entitlement remains current",async()=>{db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,"owner","b".repeat(64),"invoice",1);const store=new ChatProvisionStore(db);store.propose({cityId,slug:"london",groupId:"group"});const verified=store.verify(cityId,{metadataEventId:"a".repeat(64),publiclyReadable:true,openJoin:true});store.activate(cityId,verified.evidenceDigest!);const {serverChatConfig}=await import("./chat-config");expect(serverChatConfig().paidCities[cityId]).toEqual({slug:"london",destination:{relay:"wss://london.bitcoinwalk.org/",groupId:"group"},walkieTalkieEnabled:false,armadaEnabled:true});store.setVisibility(cityId,"walkie-talkie",true);expect(serverChatConfig().paidCities[cityId]).toMatchObject({walkieTalkieEnabled:true,armadaEnabled:true});store.setVisibility(cityId,"armada",false);expect(serverChatConfig().paidCities[cityId]).toMatchObject({walkieTalkieEnabled:true,armadaEnabled:false});db.prepare("UPDATE paid_city_entitlement SET invoiceId='changed' WHERE cityId=?").run(cityId);expect(serverChatConfig().paidCities).toEqual({});});
});
