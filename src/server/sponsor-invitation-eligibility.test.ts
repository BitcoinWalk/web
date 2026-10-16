import {DatabaseSync} from "node:sqlite";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const cityId="00000000-0000-4000-8000-000000000001",host="ab".repeat(32);
vi.mock("../nostr/city-records",()=>({queryDirectoryRecords:vi.fn(async()=>({revisions:[],approvals:[]})),queryAuthorizations:vi.fn(async()=>[{event:{},grant:{cityId,creatorPubkey:host}}])}));
vi.mock("../nostr/dashboard-data",()=>({latestDashboardGrants:(rows:unknown[])=>rows}));
vi.mock("../nostr/moderation",()=>({managedCities:vi.fn(()=>[{state:"approved",revision:{city:{cityId,cityName:"Madeira",slug:"madeira"}},decision:{approval:{slug:"madeira"}}}])}));
import {eligibleSponsorHostCities} from "./sponsor-invitation-eligibility";

describe("host sponsor invitation eligibility",()=>{
 let db:DatabaseSync;
 const deps={directory:async()=>({revisions:[],approvals:[]}),authorizations:async()=>[{event:{},grant:{cityId,creatorPubkey:host}}],verifyNip05:vi.fn(async()=>true),verifyLightning:vi.fn(async()=>true),publicOrigin:()=>new URL("https://bitcoinwalk.org")};
 beforeEach(()=>{db=new DatabaseSync(":memory:");db.exec(`CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY);CREATE TABLE pro_setup_task(cityId TEXT PRIMARY KEY,currentOwnerPubkey TEXT,payoutVersion INTEGER,brandPubkey TEXT);CREATE TABLE payout_destination_version(city_id TEXT,version INTEGER,owner_pubkey TEXT);`);db.prepare("INSERT INTO paid_city_entitlement VALUES(?)").run(cityId);db.prepare("INSERT INTO pro_setup_task VALUES(?,?,?,NULL)").run(cityId,host,3);});
 afterEach(()=>db.close());
 it("requires the exact owner payout version plus live NIP-05 and LNURL read-back",async()=>{expect(await eligibleSponsorHostCities(db,host,deps as never)).toEqual([]);db.prepare("INSERT INTO payout_destination_version VALUES(?,?,?)").run(cityId,3,host);expect(await eligibleSponsorHostCities(db,host,deps as never)).toEqual([{id:cityId,name:"Madeira",slug:"madeira",payoutVersion:3}]);expect(deps.verifyNip05).toHaveBeenCalledWith(host,"madeira@bitcoinwalk.org");});
 it("fails closed for another identity or a failed public address",async()=>{db.prepare("INSERT INTO payout_destination_version VALUES(?,?,?)").run(cityId,3,host);expect(await eligibleSponsorHostCities(db,"cd".repeat(32),deps as never)).toEqual([]);deps.verifyLightning.mockResolvedValueOnce(false);expect(await eligibleSponsorHostCities(db,host,deps as never)).toEqual([]);});
});
