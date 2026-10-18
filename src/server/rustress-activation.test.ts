import {afterEach,describe,expect,it,vi} from "vitest";
import {DatabaseSync} from "node:sqlite";
vi.mock("server-only",()=>({}));
vi.mock("./pro-setup",()=>({resolveRustressActivationEvidence:vi.fn()}));
import {managedProCityIds,managedProvisioningStatus,managedReservationPreflightReason,queueManagedProvisioning,reconcileManagedProvisioning} from "./rustress-activation";

const saved={...process.env};
afterEach(()=>{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);});
describe("managed Rustress runtime gates",()=>{
  it("is inert unless explicitly enabled",async()=>{
    delete process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED;
    await expect(queueManagedProvisioning("request")).resolves.toBeUndefined();
    await expect(reconcileManagedProvisioning()).resolves.toBeUndefined();
    expect(managedProvisioningStatus("00000000-0000-4000-8000-000000000001")).toBeNull();
  });
  it("requires a bounded managed city scope before reading credentials",async()=>{
    process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED="1";process.env.BITCOINWALK_RUSTRESS_MANAGED_CITIES="";
    await expect(queueManagedProvisioning("request")).rejects.toThrow("scope");
    process.env.BITCOINWALK_RUSTRESS_MANAGED_CITIES=Array.from({length:101},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`).join(",");
    await expect(queueManagedProvisioning("request")).rejects.toThrow("scope");
  });
  it("reports only a privacy-safe managed reservation preflight category",()=>{
    expect(managedReservationPreflightReason(new Error("City identity read-back is incomplete or superseded."))).toBe("city identity relay read-back is incomplete");
    expect(managedReservationPreflightReason(new Error("Lightning endpoint rejected the request: private provider detail"))).toBe("payout evidence is unavailable");
    expect(managedReservationPreflightReason(new Error("unexpected private detail"))).toBe("authorization evidence is unavailable");
    expect(managedReservationPreflightReason(Object.assign(new Error("private schema detail"),{name:"ZodError"}))).toBe("generated provider configuration is invalid");
    expect(managedReservationPreflightReason(new Error("City ownership, approval or entitlement changed. Prepare a new request."))).toBe("city authority changed after identity approval");
  });
});

describe("automatic verified-Pro provisioning scope",()=>{
  function fixture(){
    const db=new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT,paymentHash TEXT,invoiceId TEXT,paidAt INTEGER);
      CREATE TABLE pro_setup_task(cityId TEXT PRIMARY KEY,entitlementId TEXT,currentOwnerPubkey TEXT,payoutVersion INTEGER,brandPubkey TEXT);
      CREATE TABLE city_brand_request(id TEXT,city_id TEXT,status TEXT);`);
    return db;
  }
  const city="00000000-0000-4000-8000-000000000001";
  it("derives purchased or gifted cities only after owner setup and city identity activation",()=>{
    const db=fixture();
    db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(city,"a".repeat(64),"b".repeat(64),"entitlement",1);
    db.prepare("INSERT INTO pro_setup_task VALUES(?,?,?,?,?)").run(city,"entitlement","a".repeat(64),null,null);
    db.prepare("INSERT INTO city_brand_request VALUES(?,?,?)").run("request",city,"pending");
    expect([...managedProCityIds(db,"*")]).toEqual([]);
    db.prepare("UPDATE pro_setup_task SET payoutVersion=1,brandPubkey=? WHERE cityId=?").run("c".repeat(64),city);
    db.prepare("UPDATE city_brand_request SET status='active' WHERE city_id=?").run(city);
    expect([...managedProCityIds(db,"*")]).toEqual([city]);db.close();
  });
  it("keeps the explicit compatibility scope available during rollout",()=>{
    const db=fixture();expect([...managedProCityIds(db,city)]).toEqual([city]);db.close();
  });
});
