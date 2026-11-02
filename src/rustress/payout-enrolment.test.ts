import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it,vi} from "vitest";
import {provisionDigest,type ProvisionConfig} from "./contract";
import {PAYOUT_AUTHORITY_API} from "./payout-authority";
import {PayoutEnrolmentError,PayoutEnrolmentWorkflow,type PayoutAuthorityReceipt} from "./payout-enrolment";

const city="00000000-0000-4000-8000-000000000001";
const config:ProvisionConfig={cityId:city,version:2,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:"a".repeat(64),authorityEventId:"b".repeat(64),approvalEventId:"c".repeat(64),brandEventId:"d".repeat(64),payoutVersion:2,payoutDestination:"organizer@example.org",walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"enabled"};
const databases:DatabaseSync[]=[];afterEach(()=>databases.splice(0).forEach(db=>db.close()));
function fixture(path=":memory:"){const db=new DatabaseSync(path),records=new Map<string,PayoutAuthorityReceipt>(),key=(value:ProvisionConfig)=>`${value.cityId}:${value.payoutVersion}`;
 const provider={status:vi.fn(async(value:ProvisionConfig)=>{const result=records.get(key(value));if(!result)throw new PayoutEnrolmentError("absent");return result;}),register:vi.fn(async(value:ProvisionConfig)=>{const result:PayoutAuthorityReceipt={api:PAYOUT_AUTHORITY_API,state:"recorded",cityId:value.cityId,payoutVersion:value.payoutVersion,configHash:provisionDigest(value)};records.set(key(value),result);return result;})};
 const fresh=vi.fn(async(value:ProvisionConfig)=>value),workflow=new PayoutEnrolmentWorkflow(db,provider,fresh);databases.push(db);return {db,provider,fresh,workflow,records};}
describe("bounded automatic Pro payout enrolment",()=>{
 it("enrols two exact eligible cities without per-city approval",async()=>{const f=fixture(),second={...config,cityId:"00000000-0000-4000-8000-000000000002",localPart:"london",payoutDestination:"host@example.org"};
  for(const value of [config,second]){f.workflow.enqueue(value);expect(await f.workflow.run(value.cityId)).toMatchObject({state:"active"});}
  expect(f.provider.register).toHaveBeenCalledTimes(2);expect(f.records.size).toBe(2);});
 it("refuses ineligible or changed evidence before authority registration",async()=>{const f=fixture();f.workflow.enqueue(config);f.fresh.mockRejectedValueOnce(new PayoutEnrolmentError("rejected"));expect(await f.workflow.run(city)).toMatchObject({state:"blocked"});expect(f.provider.register).not.toHaveBeenCalled();
  const changed={...config,payoutDestination:"changed@example.org"};const g=fixture();g.workflow.enqueue(config);g.fresh.mockResolvedValueOnce(changed);expect(await g.workflow.run(city)).toMatchObject({state:"blocked"});expect(g.provider.register).not.toHaveBeenCalled();});
 it("recovers an unknown write by exact read-back without a duplicate registration",async()=>{const f=fixture();f.workflow.enqueue(config);const write=f.provider.register.getMockImplementation()!;f.provider.register.mockImplementationOnce(async value=>{await write(value);throw new PayoutEnrolmentError("unknown");});
  expect(await f.workflow.run(city)).toMatchObject({state:"unknown"});expect(await f.workflow.run(city)).toMatchObject({state:"active"});expect(f.provider.register).toHaveBeenCalledTimes(1);});
 it("preserves completed enrolment across restart",async()=>{const path=`/tmp/bw148-${crypto.randomUUID()}.sqlite`;const first=fixture(path);first.workflow.enqueue(config);await first.workflow.run(city);first.db.close();databases.splice(databases.indexOf(first.db),1);
  const second=fixture(path);second.records.set(`${city}:2`,{api:PAYOUT_AUTHORITY_API,state:"recorded",cityId:city,payoutVersion:2,configHash:provisionDigest(config)});expect(second.workflow.status(city)).toMatchObject({state:"active"});expect(await second.workflow.run(city)).toMatchObject({state:"active"});expect(second.provider.register).not.toHaveBeenCalled();});
});
