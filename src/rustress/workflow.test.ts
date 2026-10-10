import {DatabaseSync} from "node:sqlite";
import {afterEach, describe, expect, it, vi} from "vitest";
import {ProvisionWorkflow} from "./workflow";
import {ProvisioningError} from "./client";
import {provisionDigest, RUSTRESS_API, type ProvisionConfig, type ProvisionReceipt} from "./contract";

const config: ProvisionConfig = {cityId:"00000000-0000-4000-8000-000000000001",version:1,domain:"bitcoinwalk.org",localPart:"fixture-city",
  brandPubkey:"a".repeat(64),authorityEventId:"b".repeat(64),approvalEventId:"c".repeat(64),brandEventId:"d".repeat(64),payoutVersion:1,
  payoutDestination:"fixture@example.org",walletRef:"isolated-test",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"};
const databases: DatabaseSync[] = [];
afterEach(()=>{for(const db of databases)db.close();databases.length=0;});
function fixture() {
  const db=new DatabaseSync(":memory:");databases.push(db);
  let state:"prepared"|"applied"="prepared";
  const receipt=(): ProvisionReceipt=>({api:RUSTRESS_API,cityId:config.cityId,version:1,configHash:provisionDigest(config),state,invoiceIssuance:"disabled"});
  const provider={prepare:vi.fn(async()=>receipt()),apply:vi.fn(async()=>{state="applied";return receipt();}),status:vi.fn(async()=>receipt())};
  const resolve=vi.fn(async()=>({config,proofHash:"e".repeat(64)}));
  let now=1000;
  const workflow=new ProvisionWorkflow(db,provider,resolve,()=>now);
  return {db,provider,resolve,workflow,advance:()=>{now+=121_000;}};
}
describe("durable disabled-only provisioning workflow",()=>{
  it("persists first, reads back, and never creates duplicate versions",async()=>{
    const f=fixture();await f.workflow.enqueue("request");
    expect(f.workflow.status(config.cityId)?.state).toBe("queued");
    expect((await f.workflow.run(config.cityId))?.state).toBe("verified");
    await f.workflow.enqueue("request");await f.workflow.run(config.cityId);
    expect(f.provider.prepare).toHaveBeenCalledTimes(1);expect(f.provider.apply).toHaveBeenCalledTimes(1);
    expect(f.resolve.mock.calls.length).toBeGreaterThan(4);
    expect(JSON.stringify(f.workflow.status(config.cityId))).not.toContain("fixture@example.org");
  });
  it("refuses to replace saved evidence",async()=>{
    const f=fixture();await f.workflow.enqueue("request");
    f.resolve.mockResolvedValue({config:{...config,payoutVersion:2},proofHash:"e".repeat(64)});
    await expect(f.workflow.enqueue("request")).rejects.toThrow("requires review");
    expect((await f.workflow.run(config.cityId))?.state).toBe("blocked");expect(f.provider.prepare).not.toHaveBeenCalled();
  });
  it("checks entitlement proof even if provider configuration is unchanged",async()=>{
    const f=fixture();await f.workflow.enqueue("request");f.resolve.mockResolvedValue({config,proofHash:"f".repeat(64)});
    expect((await f.workflow.run(config.cityId))?.state).toBe("blocked");expect(f.provider.apply).not.toHaveBeenCalled();
  });
  it("reconciles lost apply responses after constructing a fresh worker",async()=>{
    const f=fixture();await f.workflow.enqueue("request");
    const apply=f.provider.apply.getMockImplementation()!;
    f.provider.apply.mockImplementationOnce(async()=>{await apply();throw new ProvisioningError("unknown");});
    expect((await f.workflow.run(config.cityId))?.state).toBe("unknown");
    const restarted=new ProvisionWorkflow(f.db,f.provider,f.resolve);
    expect((await restarted.run(config.cityId))?.state).toBe("verified");expect(f.provider.apply).toHaveBeenCalledTimes(1);
  });
  it("never guesses absence after an uncertain prepare",async()=>{
    const f=fixture();await f.workflow.enqueue("request");f.provider.prepare.mockRejectedValue(new ProvisioningError("unknown"));
    await f.workflow.run(config.cityId);f.provider.status.mockRejectedValue(new ProvisioningError("unavailable"));
    expect((await f.workflow.run(config.cityId))?.state).toBe("unknown");expect(f.provider.prepare).toHaveBeenCalledTimes(1);
  });
  it("recovers an unknown reservation only after confirmed provider absence",async()=>{
    const f=fixture();await f.workflow.enqueue("request");
    f.provider.prepare.mockRejectedValueOnce(new ProvisioningError("unavailable"));
    expect((await f.workflow.run(config.cityId))?.state).toBe("unknown");
    f.provider.status.mockRejectedValueOnce(new ProvisioningError("absent"));
    expect((await f.workflow.run(config.cityId))?.state).toBe("verified");
    expect(f.provider.prepare).toHaveBeenCalledTimes(2);
    expect(f.provider.prepare.mock.calls[0]).toEqual(f.provider.prepare.mock.calls[1]);
    expect(f.provider.apply).toHaveBeenCalledTimes(1);
  });
  it("does not apply if authority changes after prepare",async()=>{
    const f=fixture();await f.workflow.enqueue("request");
    f.provider.prepare.mockImplementationOnce(async()=>{f.resolve.mockResolvedValue({config,proofHash:"f".repeat(64)});return f.provider.status();});
    expect((await f.workflow.run(config.cityId))?.state).toBe("blocked");expect(f.provider.apply).not.toHaveBeenCalled();
  });
  it("ignores unexpired leases and recovers interrupted writes read-only",async()=>{
    const f=fixture();await f.workflow.enqueue("request");
    f.db.prepare("UPDATE rustress_provision_task SET phase='applying',lease='old',until=120000").run();
    await f.workflow.run(config.cityId);expect(f.provider.status).not.toHaveBeenCalled();
    await f.provider.apply();f.advance();
    expect((await f.workflow.run(config.cityId))?.state).toBe("verified");expect(f.provider.apply).toHaveBeenCalledTimes(1);
  });
  it("keeps an unsent task retryable after relay outages",async()=>{
    const f=fixture();await f.workflow.enqueue("request");f.resolve.mockRejectedValueOnce(new Error("private unavailable"));
    expect((await f.workflow.run(config.cityId))?.state).toBe("queued");expect(f.provider.prepare).not.toHaveBeenCalled();
    expect((await f.workflow.run(config.cityId))?.state).toBe("verified");
  });
  it("persists already-signed queue evidence but still requires a fresh read before provider access",async()=>{
    const f=fixture();f.workflow.enqueueEvidence("request",{config,proofHash:"e".repeat(64)});
    expect(f.resolve).not.toHaveBeenCalled();expect(f.workflow.status(config.cityId)?.state).toBe("queued");
    f.resolve.mockRejectedValueOnce(new Error("relay unavailable"));expect((await f.workflow.run(config.cityId))?.state).toBe("queued");
    expect(f.provider.prepare).not.toHaveBeenCalled();expect((await f.workflow.run(config.cityId))?.state).toBe("verified");
  });
  it("rejects drift and never stores provider errors",async()=>{
    const f=fixture();await f.workflow.enqueue("request");await f.workflow.run(config.cityId);
    f.provider.status.mockRejectedValue(new Error("SECRET"));
    expect((await f.workflow.run(config.cityId))?.state).toBe("unknown");
    expect(JSON.stringify(f.db.prepare("SELECT * FROM rustress_provision_task").all())).not.toContain("SECRET");
  });
});
