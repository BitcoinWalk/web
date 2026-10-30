import {DatabaseSync} from "node:sqlite";
import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {ProSetupTaskStore} from "./pro-setup-task-store";
import {CityBrandStore} from "../directory/city-brand-store";
import {ActivationWorkflow} from "../rustress/activation-workflow";
import {cityOutcomeReport} from "./city-outcomes";

let db:DatabaseSync;
const city="00000000-0000-4000-8000-000000000001",owner="a".repeat(64),brand="b".repeat(64),entitlement="c".repeat(64);
function setup(){
 const tasks=new ProSetupTaskStore(db);new CityBrandStore(db);
 new ActivationWorkflow(db,{status:async()=>{throw Error("not called");}},{prepare:async()=>{throw Error("not called");},apply:async()=>{throw Error("not called");},status:async()=>{throw Error("not called");}},{nip05:async()=>{},lnurl:async()=>{}},async()=>{throw Error("not called");});
 tasks.ensure({cityId:city,entitlementId:entitlement,originalOwnerPubkey:owner,currentOwnerPubkey:owner},100);
 tasks.confirmPayout(city,entitlement,owner,1,110);tasks.confirmSigner(city,entitlement,owner,brand,120);
 tasks.confirmArtwork(city,entitlement,owner,{revisionId:"d".repeat(64),avatar:"https://example.org/avatar",banner:"https://example.org/banner"},130);
 const challenge=JSON.stringify({authority:{ownerPubkey:owner,entitlementId:entitlement},binding:{brandPubkey:brand}});
 db.prepare("INSERT INTO city_brand_request VALUES(?,?,?,'active',200,?,?,?)").run("request",city,challenge,"private-owner-proof","private-brand-proof",JSON.stringify({id:"event"}));
 db.prepare("INSERT INTO city_brand_publication VALUES('request','event',140,'[]')").run();
 db.prepare("INSERT INTO rustress_activation_task VALUES(?, 'request','{}',?,'secret','https://example.org','active','active','active',NULL,0,150000)").run(city,JSON.stringify({payoutVersion:1}));
 return tasks;
}
beforeEach(()=>{db=new DatabaseSync(":memory:");});afterEach(()=>db.close());
describe("city setup outcome snapshot",()=>{
 it("counts a city once across repeated reads and store reconstruction without writing or exposing private evidence",()=>{
  setup();const changes=db.prepare("SELECT total_changes() count").get();
  const report=cityOutcomeReport(db,0,200);expect(report).toEqual({status:"available",started:1,preparationReady:1,identityPublished:1,servicesActive:1,needsAttention:0});
  expect(cityOutcomeReport(db,0,200)).toEqual(report);expect(db.prepare("SELECT total_changes() count").get()).toEqual(changes);
  new ProSetupTaskStore(db);expect(cityOutcomeReport(db,0,200)).toEqual(report);
  expect(JSON.stringify(report)).not.toMatch(/secret|request|private|https|00000000|aaaa|bbbb|cccc/);
 });
 it("uses the setup creation cohort rather than the most recent retry time",()=>{setup();expect(cityOutcomeReport(db,101,200)).toMatchObject({started:0,servicesActive:0});expect(cityOutcomeReport(db,0,99)).toMatchObject({started:0});});
 it("does not treat incomplete address verification as activation",()=>{setup();db.exec("UPDATE rustress_activation_task SET lnurl='needs-attention'");expect(cityOutcomeReport(db,0,200)).toMatchObject({servicesActive:0,needsAttention:1,identityPublished:1});});
 it("does not reuse another owner's binding or an old payout version",()=>{
  const tasks=setup();tasks.confirmPayout(city,entitlement,owner,2,160);expect(cityOutcomeReport(db,0,200)).toMatchObject({servicesActive:0});
  tasks.ensure({cityId:city,entitlementId:entitlement,originalOwnerPubkey:owner,currentOwnerPubkey:"e".repeat(64)},170);
  expect(cityOutcomeReport(db,0,200)).toMatchObject({started:1,preparationReady:0,identityPublished:0,servicesActive:0});
 });
 it("does not fall back to an old active request after cancellation or replacement",()=>{setup();db.exec("INSERT INTO city_brand_request SELECT 'replacement',city_id,challenge,'cancelled',200,NULL,NULL,NULL FROM city_brand_request");expect(cityOutcomeReport(db,0,200)).toMatchObject({identityPublished:0,servicesActive:0});});
 it("rejects mismatched publication evidence and malformed stored JSON",()=>{setup();db.exec("UPDATE city_brand_request SET approved_event='{}'");expect(cityOutcomeReport(db,0,200)).toMatchObject({identityPublished:0,servicesActive:0});db.exec("UPDATE city_brand_request SET challenge='broken'");expect(cityOutcomeReport(db,0,200)).toMatchObject({identityPublished:0});});
 it("reports missing or broken storage as unavailable rather than a successful zero",()=>{expect(cityOutcomeReport(db,0,200)).toEqual({status:"unavailable"});setup();db.exec("ALTER TABLE pro_setup_task RENAME COLUMN createdAt TO missing");expect(cityOutcomeReport(db,0,200)).toEqual({status:"unavailable"});});
});
