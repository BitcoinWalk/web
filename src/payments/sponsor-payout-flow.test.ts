import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {encode,sign} from "bolt11";
import {afterEach,describe,expect,it,vi} from "vitest";
import {validateOutgoingInvoice,type OutgoingTerms} from "../rustress/outgoing-invoice";
import type {PayoutWallet} from "../rustress/payout-worker";
import type {PayoutDestinationVersion} from "./payout-destination-store";
import {SponsorPayoutFlow,type SponsorPayoutPolicy} from "./sponsor-payout-flow";
import {SponsorPayoutStore} from "./sponsor-payout-sender";
import type {SponsorWalletReadinessEvidence} from "./sponsor-wallet-readiness";

const time=1_800_000_000,orderId="10000000-0000-4000-8000-000000000001",invitationId="20000000-0000-4000-8000-000000000001",cityId="30000000-0000-4000-8000-000000000001",host="34".repeat(32),binding="ab".repeat(32),walletRef="sponsor-wallet";
const preimage="12".repeat(32),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex"),terms:OutgoingTerms={amountMsat:"16590000",minMsat:"1000",maxMsat:"20000000",network:"bc",metadata:'[["text/plain","host payout"]]'};
const invoice=sign(encode({satoshis:16590,timestamp:time,tags:[{tagName:"payment_hash",data:paymentHash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(terms.metadata).digest("hex")},{tagName:"expire_time",data:3600}]}),"56".repeat(32)).paymentRequest!;
const dbs:DatabaseSync[]=[];afterEach(()=>dbs.splice(0).forEach(db=>db.close()));

function fixture(changes:Partial<SponsorPayoutPolicy>={}){
 const db=new DatabaseSync(":memory:");dbs.push(db);db.exec(`CREATE TABLE sponsorship_host_obligation(orderId TEXT PRIMARY KEY,invitationId TEXT NOT NULL,cityId TEXT NOT NULL,hostPubkey TEXT NOT NULL,payoutVersion INTEGER NOT NULL,receivedMsat TEXT NOT NULL,hostMsat TEXT NOT NULL,retainedMsat TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('owed','paid','unknown')));`);db.prepare("INSERT INTO sponsorship_host_obligation VALUES(?,?,?,?,?,?,?,?,'owed')").run(orderId,invitationId,cityId,host,3,"21000000","16590000","4410000");
 const store=new SponsorPayoutStore(db,()=>time),destination:PayoutDestinationVersion={cityId,version:3,ownerPubkey:host,normalized:"host@example.org",endpoint:"https://example.org/.well-known/lnurlp/host",callback:"https://example.org/callback",minSendable:1000,maxSendable:20000000,confirmedAt:time-100};
 const readiness:SponsorWalletReadinessEvidence={connectionRef:walletRef,checkoutConnectionRef:"sponsor-checkout",zapConnectionRef:"city-zaps",network:"mainnet",inventory:{checkedAt:time-10,expiresAt:time+300,grantedMethods:["get_info","lookup_invoice","list_transactions","pay_invoice","get_balance"],revoked:false,budgetMsat:20_000_000,remainingBudgetMsat:20_000_000,budgetRenewal:"never",isolated:true},protocol:{checkedAt:time-10,advertisedMethods:["get_info","lookup_invoice","list_transactions","pay_invoice","get_balance"],successfulReadMethods:["get_info","lookup_invoice","list_transactions"]},policy:{approvedAt:time-100,expiresAt:time+300,expectedNetwork:"mainnet",maximumBudgetMsat:20_000_000,maximumPayoutMsat:17_000_000,maximumFeeMsat:200_000,feeLimitVerified:true}};
 const journalServiceId="ce72e914-5890-4902-8e8c-16fb30d80f11",checked=validateOutgoingInvoice(invoice,terms,time),retrieve=vi.fn(async()=>checked),authorize=vi.fn(async()=>true),claim=vi.fn(async()=>true),recovery={binding,serviceId:journalServiceId,ready:true,claim};
 const paid={state:"paid" as const,walletRef,paymentHash,amountMsat:"16590000",feeMsat:"1000",preimage},wallet={walletRef,binding,network:"bc" as const,send:vi.fn(async()=>{}),lookup:vi.fn<PayoutWallet["lookup"]>(async()=>paid)};
 const policy:SponsorPayoutPolicy={binding,walletRef,journalServiceId,budgetMsat:"20000000",acceptedPriorSpentMsat:"0",maximumPayoutMsat:"17000000",maximumFeeMsat:"200000",cityIds:[cityId],expiresAt:time+300,...changes};
 const evidence=vi.fn(async()=>({binding,readiness})),flow=new SponsorPayoutFlow(store,{wallet,destinations:{version:()=>destination},evidence,authorize,recovery,retrieve},policy,()=>time);
 return {db,store,destination,readiness,retrieve,authorize,claim,recovery,wallet,policy,evidence,flow};
}

describe("guarded sponsorship payout flow",()=>{
 it("combines fresh wallet evidence, current business authority, budget and recovery fence",async()=>{const f=fixture();expect(await f.flow.process(orderId)).toMatchObject({state:"paid",amountMsat:"16590000"});expect(f.authorize).toHaveBeenCalledTimes(2);expect(f.claim).toHaveBeenCalledTimes(1);expect(f.wallet.send).toHaveBeenCalledWith(expect.objectContaining({maximumFeeMsat:"165900"}));expect(f.store.budgetUsage(walletRef)).toEqual({usedMsat:"16591000",uncertain:0});});
 it("fails closed before invoice retrieval when wallet inventory is revoked",async()=>{const f=fixture();f.readiness.inventory.revoked=true;expect(await f.flow.process(orderId)).toMatchObject({state:"owed",attemptState:null});expect(f.retrieve).not.toHaveBeenCalled();expect(f.wallet.send).not.toHaveBeenCalled();});
 it("fails closed for an unapproved city or expired operation",async()=>{const other=fixture({cityIds:["50000000-0000-4000-8000-000000000001"]});expect(await other.flow.process(orderId)).toMatchObject({state:"owed"});expect(other.retrieve).not.toHaveBeenCalled();const expired=fixture({expiresAt:time});expect(await expired.flow.process(orderId)).toMatchObject({state:"owed"});expect(expired.retrieve).not.toHaveBeenCalled();});
 it("refuses changed wallet bindings and fee policy below the deterministic cap",async()=>{const f=fixture();expect(()=>new SponsorPayoutFlow(f.store,{wallet:{...f.wallet,binding:"cd".repeat(32)},destinations:{version:()=>f.destination},evidence:f.evidence,authorize:f.authorize,recovery:f.recovery,retrieve:f.retrieve},f.policy,()=>time)).toThrow("policy mismatch");const low=fixture({maximumFeeMsat:"10000"});expect(await low.flow.process(orderId)).toMatchObject({state:"owed",attemptState:null});expect(low.wallet.send).not.toHaveBeenCalled();});
});
