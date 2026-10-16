import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {encode,sign} from "bolt11";
import {afterEach,describe,expect,it,vi} from "vitest";
import {RemoteJournalStore} from "../rustress/remote-journal-store";
import {validateOutgoingInvoice,type OutgoingTerms} from "../rustress/outgoing-invoice";
import {SponsorPayoutRecovery} from "./sponsor-payout-recovery";
import {SponsorPayoutStore} from "./sponsor-payout-sender";

const time=1_800_000_000,orderId="10000000-0000-4000-8000-000000000001",invitationId="20000000-0000-4000-8000-000000000001",cityId="30000000-0000-4000-8000-000000000001",attemptId="40000000-0000-4000-8000-000000000001",host="34".repeat(32),binding="ab".repeat(32),walletRef="sponsor-wallet";
const preimage="12".repeat(32),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex"),terms:OutgoingTerms={amountMsat:"16590000",minMsat:"1000",maxMsat:"20000000",network:"bc",metadata:'[["text/plain","host payout"]]'};
const invoice=sign(encode({satoshis:16590,timestamp:time,tags:[{tagName:"payment_hash",data:paymentHash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(terms.metadata).digest("hex")},{tagName:"expire_time",data:3600}]}),"56".repeat(32)).paymentRequest!;
const dbs:DatabaseSync[]=[];afterEach(()=>dbs.splice(0).forEach(db=>db.close()));

function fixture(){
 const local=new DatabaseSync(":memory:"),remote=new DatabaseSync(":memory:");dbs.push(local,remote);
 local.exec(`CREATE TABLE sponsorship_host_obligation(orderId TEXT PRIMARY KEY,invitationId TEXT NOT NULL,cityId TEXT NOT NULL,hostPubkey TEXT NOT NULL,payoutVersion INTEGER NOT NULL,receivedMsat TEXT NOT NULL,hostMsat TEXT NOT NULL,retainedMsat TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('owed','paid','unknown')));`);
 local.prepare("INSERT INTO sponsorship_host_obligation VALUES(?,?,?,?,?,?,?,?,'owed')").run(orderId,invitationId,cityId,host,3,"21000000","16590000","4410000");
 const store=new SponsorPayoutStore(local,()=>time),checked=validateOutgoingInvoice(invoice,terms,time);store.reserve({id:attemptId,orderId,walletRef,destinationFingerprint:"cd".repeat(32),paymentHash,amountMsat:"16590000",feeCapMsat:"10000",expiresAt:checked.expiresAt,invoice:checked.paymentRequest,terms:checked.terms});
 const journal=new RemoteJournalStore(remote,binding),initial=journal.state(),state=journal.control(initial.serviceId,initial.fence,"activate");
 const client={binding,serviceId:state.serviceId,status:async()=>journal.state(),page:async(after=0)=>journal.page(after),claim:async(input:Parameters<RemoteJournalStore["claim"]>[0])=>journal.claim(input)};
 const paid={state:"paid" as const,walletRef,paymentHash,amountMsat:"16590000",feeMsat:"1000",preimage},lookup=vi.fn(async()=>paid),history=vi.fn(async()=>({binding,complete:true,outgoingHashes:[paymentHash]}));
 const recovery=new SponsorPayoutRecovery(client,store,walletRef,history,lookup,()=>true);
 return {store,journal,client,recovery,lookup,history,paid};
}

describe("sponsorship off-host payout recovery",()=>{
 it("creates one remote permission only after the local attempt is durably unknown",async()=>{const f=fixture();f.history.mockResolvedValueOnce({binding,complete:true,outgoingHashes:[]});expect(await f.recovery.reconcile()).toEqual({state:"reconciled"});expect(f.store.claimWithinBudget(attemptId,walletRef,"20000000")).toBe(true);expect(await f.recovery.claim(attemptId)).toBe(true);expect(f.journal.page().entries).toHaveLength(1);expect(await f.recovery.claim(attemptId)).toBe(false);});
 it("reconciles a journaled unknown send by exact wallet history and lookup",async()=>{const f=fixture();f.history.mockResolvedValueOnce({binding,complete:true,outgoingHashes:[]});await f.recovery.reconcile();expect(f.store.claimWithinBudget(attemptId,walletRef,"20000000")).toBe(true);await f.recovery.claim(attemptId);const restarted=new SponsorPayoutRecovery(f.client,f.store,walletRef,f.history,f.lookup,()=>true);expect(await restarted.reconcile()).toEqual({state:"reconciled"});expect(f.store.status(orderId)).toMatchObject({state:"paid",feeMsat:"1000"});expect(f.lookup).toHaveBeenCalledWith(paymentHash);});
 it("blocks when wallet history cannot account for every journal entry",async()=>{const f=fixture();f.history.mockResolvedValueOnce({binding,complete:true,outgoingHashes:[]});await f.recovery.reconcile();f.store.claimWithinBudget(attemptId,walletRef,"20000000");await f.recovery.claim(attemptId);f.history.mockResolvedValue({binding,complete:true,outgoingHashes:[]});expect(await new SponsorPayoutRecovery(f.client,f.store,walletRef,f.history,f.lookup,()=>true).reconcile()).toEqual({state:"blocked"});expect(f.store.status(orderId)?.state).toBe("unknown");});
 it("fails closed when deployment approval is absent or the journal is paused",async()=>{const f=fixture();expect(await new SponsorPayoutRecovery(f.client,f.store,walletRef,f.history,f.lookup).reconcile()).toEqual({state:"blocked"});const state=f.journal.state();f.journal.control(state.serviceId,state.fence,"pause");expect(await f.recovery.reconcile()).toEqual({state:"blocked"});});
});
