import {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {encode,sign} from "bolt11";
import {PayoutInvoiceIssuer,PAYOUT_ISSUE_API} from "./payout-invoice-issuer";
import {PayoutInvoiceIntake} from "./payout-intake";
import {PayoutLedger} from "./payout-ledger";

const dbs:DatabaseSync[]=[];afterEach(()=>dbs.splice(0).forEach(db=>db.close()));
const now=1_800_000_000,hash="ab".repeat(32),descriptionHash="cd".repeat(32);
function bolt(amount="100000",commitment=descriptionHash){return sign(encode({millisatoshis:amount,timestamp:now,tags:[{tagName:"payment_hash",data:hash},{tagName:"purpose_commit_hash",data:commitment},{tagName:"expire_time",data:3600}]}),"12".repeat(32)).paymentRequest!;}
function fixture(enabled=true){
 const db=new DatabaseSync(":memory:");dbs.push(db);const ledger=new PayoutLedger(db),bucket={cityId:randomUUID(),walletRef:"bitcoinwalk-rustress",destinationVersion:2,destination:"organizer@example.org"};
 const resolve=vi.fn(async()=>enabled?{...bucket,invoiceIssuance:"enabled" as const}:null),intake=new PayoutInvoiceIntake(ledger,async()=>bucket,()=>now);
 const wallet={makeInvoice:vi.fn(async()=>({type:"incoming",amount:100000,payment_hash:hash,invoice:bolt()}))};
 const issuer=new PayoutInvoiceIssuer(db,intake,resolve,wallet,value=>ledger.incomingStatus("bitcoinwalk-rustress",value),()=>now),request={api:PAYOUT_ISSUE_API,requestId:randomUUID(),cityId:bucket.cityId,payoutVersion:2,amountMsat:"100000",descriptionHash,requestedAt:now,expirySeconds:3600};
 return {db,ledger,bucket,resolve,intake,wallet,issuer,request};
}
describe("private payout invoice issuer",()=>{
 it("persists the request, validates the exact invoice and records intake before returning",async()=>{const f=fixture();const result=await f.issuer.issue(f.request);expect(result).toMatchObject({paymentHash:hash,amountMsat:"100000"});expect(f.ledger.incoming("bitcoinwalk-rustress",hash)).toMatchObject({cityId:f.bucket.cityId,destination:"organizer@example.org"});expect(f.issuer.status()).toEqual({invoiceIssued:1,invoiceCreatedPendingIntake:0,invoiceOutcomesUnknown:0});});
 it("coalesces concurrent exact retries and returns a saved issued invoice without another wallet call",async()=>{const f=fixture();const [a,b]=await Promise.all([f.issuer.issue(f.request),f.issuer.issue(f.request)]);expect(a).toEqual(b);expect(f.wallet.makeInvoice).toHaveBeenCalledTimes(1);expect(await f.issuer.issue(f.request)).toEqual(a);expect(f.wallet.makeInvoice).toHaveBeenCalledTimes(1);});
 it("quarantines ambiguous wallet outcomes across restart and never retries",async()=>{const f=fixture();f.wallet.makeInvoice.mockRejectedValueOnce(new Error("timeout"));await expect(f.issuer.issue(f.request)).rejects.toThrow("review");const restarted=new PayoutInvoiceIssuer(f.db,f.intake,f.resolve,f.wallet,value=>f.ledger.incomingStatus("bitcoinwalk-rustress",value),()=>now);await expect(restarted.issue(f.request)).rejects.toThrow("review");expect(f.wallet.makeInvoice).toHaveBeenCalledTimes(1);expect(restarted.status().invoiceOutcomesUnknown).toBe(1);});
 it("resumes a created invoice after an intake outage without creating another invoice",async()=>{const f=fixture();const original=f.intake.register.bind(f.intake),register=vi.spyOn(f.intake,"register").mockRejectedValueOnce(new Error("offline"));await expect(f.issuer.issue(f.request)).rejects.toThrow();register.mockImplementation(original);expect((await f.issuer.issue(f.request)).paymentHash).toBe(hash);expect(f.wallet.makeInvoice).toHaveBeenCalledTimes(1);});
 it.each(["disabled","changed","stale","amount","commitment"])("rejects %s requests or wallet evidence",async mode=>{const f=fixture(mode!=="disabled"),request={...f.request};if(mode==="changed"){await f.issuer.issue(request);request.amountMsat="200000";}if(mode==="stale")request.requestedAt=now-86401;if(mode==="amount")f.wallet.makeInvoice.mockResolvedValue({type:"incoming",amount:200000,payment_hash:hash,invoice:bolt("200000")});if(mode==="commitment")f.wallet.makeInvoice.mockResolvedValue({type:"incoming",amount:100000,payment_hash:hash,invoice:bolt("100000","ef".repeat(32))});await expect(f.issuer.issue(request)).rejects.toThrow();});
 it("rejects extra recipient input and caps public receipt size at one million sats",async()=>{const f=fixture();await expect(f.issuer.issue({...f.request,destination:"attacker@example.org"})).rejects.toThrow("rejected");await expect(f.issuer.issue({...f.request,requestId:randomUUID(),amountMsat:"1000000001"})).rejects.toThrow("rejected");});
 it("returns only settlement state for an exact issued city invoice",async()=>{const f=fixture();await f.issuer.issue(f.request);expect(f.issuer.lookup({api:PAYOUT_ISSUE_API,cityId:f.bucket.cityId,payoutVersion:2,paymentHash:hash})).toEqual({api:PAYOUT_ISSUE_API,paymentHash:hash,settled:false});expect(()=>f.issuer.lookup({api:PAYOUT_ISSUE_API,cityId:randomUUID(),payoutVersion:2,paymentHash:hash})).toThrow("unavailable");});
});
