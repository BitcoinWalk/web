import {DatabaseSync} from "node:sqlite";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const cityId="00000000-0000-4000-8000-000000000001",host="ab".repeat(32);
vi.mock("../nostr/city-records",()=>({queryDirectoryRecords:vi.fn(async()=>({revisions:[],approvals:[]})),queryAuthorizations:vi.fn(async()=>[{event:{},grant:{cityId,creatorPubkey:host}}])}));
vi.mock("../nostr/dashboard-data",()=>({latestDashboardGrants:(rows:unknown[])=>rows}));
vi.mock("../nostr/moderation",()=>({managedCities:vi.fn(()=>[{state:"approved",revision:{city:{cityId,cityName:"Madeira",slug:"madeira"}},decision:{approval:{slug:"madeira"}}}])}));
vi.mock("../rustress/provisioning-capabilities",()=>({cityProvisioningCapabilities:vi.fn(()=>({overall:"active",nip05:"active",lightning:"active",retryable:false,detail:"verified"}))}));
import {eligibleSponsorHostCities} from "./sponsor-invitation-eligibility";

describe("host sponsor invitation eligibility",()=>{
 let db:DatabaseSync;
 beforeEach(()=>{db=new DatabaseSync(":memory:");db.exec(`CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY);CREATE TABLE pro_setup_task(cityId TEXT PRIMARY KEY,payoutVersion INTEGER);CREATE TABLE rustress_activation_task(city TEXT PRIMARY KEY,phase TEXT,activation_config TEXT);CREATE TABLE rustress_payout_update_task(city TEXT,payout_version INTEGER,phase TEXT);`);db.prepare("INSERT INTO paid_city_entitlement VALUES(?)").run(cityId);db.prepare("INSERT INTO pro_setup_task VALUES(?,?)").run(cityId,3);db.prepare("INSERT INTO rustress_activation_task VALUES(?,'active',?)").run(cityId,JSON.stringify({payoutVersion:2}));});
 afterEach(()=>db.close());
 it("requires the owner-confirmed payout version to be the version actually active",async()=>{expect(await eligibleSponsorHostCities(db,host)).toEqual([]);db.prepare("INSERT INTO rustress_payout_update_task VALUES(?,3,'active')").run(cityId);expect(await eligibleSponsorHostCities(db,host)).toEqual([{id:cityId,name:"Madeira",slug:"madeira",payoutVersion:3}]);});
 it("fails closed for another identity",async()=>{db.prepare("INSERT INTO rustress_payout_update_task VALUES(?,3,'active')").run(cityId);expect(await eligibleSponsorHostCities(db,"cd".repeat(32))).toEqual([]);});
});
