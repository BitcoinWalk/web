import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it,vi} from "vitest";
import {createCityActivation} from "./activation-contract";
import {ActivationWorkflow,type ActivationEvidence} from "./activation-workflow";
import {ProvisioningError} from "./client";
import {provisionDigest,RUSTRESS_API,type ActivationReceipt,type ProvisionConfig,type ProvisionReceipt} from "./contract";

const reserved:ProvisionConfig={cityId:"00000000-0000-4000-8000-000000000001",version:1,domain:"bitcoinwalk.org",localPart:"madeira",
  brandPubkey:"a".repeat(64),authorityEventId:"b".repeat(64),approvalEventId:"c".repeat(64),brandEventId:"d".repeat(64),payoutVersion:2,
  payoutDestination:"organizer@example.org",walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"};
const activation=createCityActivation(reserved),databases:DatabaseSync[]=[];
afterEach(()=>{for(const db of databases)db.close();databases.length=0;});
function fixture(){
  const db=new DatabaseSync(":memory:");databases.push(db);let providerState:"prepared"|"applied"="prepared",now=1000;
  const evidence:ActivationEvidence={reserved,activation,proofHash:"e".repeat(64),publicOrigin:"https://bitcoinwalk.org"};
  const reservedReceipt:ProvisionReceipt={api:RUSTRESS_API,cityId:reserved.cityId,version:1,configHash:provisionDigest(reserved),state:"applied",invoiceIssuance:"disabled"};
  const receipt=():ActivationReceipt=>({api:RUSTRESS_API,cityId:activation.cityId,version:2,configHash:provisionDigest(activation),state:providerState,invoiceIssuance:"enabled"});
  const reservation={status:vi.fn(async()=>reservedReceipt)},provider={prepare:vi.fn(async()=>receipt()),apply:vi.fn(async()=>{providerState="applied";return receipt();}),status:vi.fn(async()=>receipt())};
  const verify={nip05:vi.fn(async()=>({state:"verified"})),lnurl:vi.fn(async()=>({state:"verified"}))},resolve=vi.fn(async()=>evidence);
  const workflow=new ActivationWorkflow(db,reservation,provider,verify,resolve,()=>now);
  return {db,evidence,reservation,provider,verify,resolve,workflow,advance:()=>{now+=121_000;}};
}
describe("durable managed city activation",()=>{
  it("requires the applied disabled reservation, activates, and verifies both capabilities",async()=>{
    const f=fixture();await f.workflow.enqueue("request");
    expect(await f.workflow.run(reserved.cityId)).toMatchObject({state:"active",nip05:"active",lnurl:"active"});
    expect(f.reservation.status).toHaveBeenCalledWith(reserved);expect(f.provider.prepare).toHaveBeenCalledWith(activation);
    expect(f.provider.apply).toHaveBeenCalledWith(activation);expect(f.verify.nip05).toHaveBeenCalledWith(expect.objectContaining({localPart:"madeira",brandPubkey:reserved.brandPubkey}));
  });
  it("records NIP-05 and Lightning independently and safely retries public verification",async()=>{
    const f=fixture();f.verify.lnurl.mockRejectedValueOnce(new Error("offline"));await f.workflow.enqueue("request");
    expect(await f.workflow.run(reserved.cityId)).toMatchObject({state:"needs-attention",nip05:"active",lnurl:"needs-attention"});
    expect(await f.workflow.run(reserved.cityId)).toMatchObject({state:"active",nip05:"active",lnurl:"active"});
    expect(f.provider.apply).toHaveBeenCalledTimes(1);
  });
  it("blocks stale authority before any activation write",async()=>{
    const f=fixture();await f.workflow.enqueue("request");f.resolve.mockResolvedValue({...f.evidence,proofHash:"f".repeat(64)});
    expect(await f.workflow.run(reserved.cityId)).toMatchObject({state:"blocked",nip05:"needs-attention",lnurl:"needs-attention"});
    expect(f.provider.prepare).not.toHaveBeenCalled();
  });
  it("refuses changed tasks and invalid public origins",async()=>{
    const f=fixture();await f.workflow.enqueue("request");f.resolve.mockResolvedValue({...f.evidence,activation:{...activation,payoutVersion:3}});
    await expect(f.workflow.enqueue("request")).rejects.toThrow();
    const other=fixture();other.resolve.mockResolvedValue({...other.evidence,publicOrigin:"https://app-staging.bitcoinwalk.org"});
    await expect(other.workflow.enqueue("request")).rejects.toThrow("Canonical public");
  });
  it("reconciles a lost apply response without sending a second activation",async()=>{
    const f=fixture();await f.workflow.enqueue("request");const apply=f.provider.apply.getMockImplementation()!;
    f.provider.apply.mockImplementationOnce(async()=>{await apply();throw new ProvisioningError("unknown");});
    expect(await f.workflow.run(reserved.cityId)).toMatchObject({state:"unknown"});
    expect(await f.workflow.run(reserved.cityId)).toMatchObject({state:"active"});expect(f.provider.apply).toHaveBeenCalledTimes(1);
  });
  it("does not leak provider errors into durable state",async()=>{
    const f=fixture();await f.workflow.enqueue("request");f.provider.prepare.mockRejectedValue(new Error("SECRET"));
    expect(await f.workflow.run(reserved.cityId)).toMatchObject({state:"unknown"});
    expect(JSON.stringify(f.db.prepare("SELECT * FROM rustress_activation_task").all())).not.toContain("SECRET");
  });
});
