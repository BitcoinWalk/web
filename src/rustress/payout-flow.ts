import {createHash} from "node:crypto";
import {z} from "zod";
import {PayoutLedger,type IncomingSnapshot} from "./payout-ledger";
import {PayoutWorker,type PayoutWallet} from "./payout-worker";
import {retrieveRecipientInvoice} from "./recipient-invoice";
import {assessRustressWallet,type WalletReadinessEvidence} from "./wallet-readiness";

const money=z.string().regex(/^(0|[1-9][0-9]{0,15})$/).refine(v=>BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER));
const policySchema=z.object({binding:z.string().regex(/^[0-9a-f]{64}$/),budgetMsat:money.refine(v=>BigInt(v)>0n),
 maximumPayoutMsat:money.refine(v=>BigInt(v)>=1000n),maximumFeeMsat:money,feePolicy:z.literal("ldk-native-v1"),expiresAt:z.number().int().safe().positive()}).strict();
type Policy=z.infer<typeof policySchema>;
type Dependencies={
 wallet:PayoutWallet&{binding:string};
 reader:{walletRef:string;binding:string;lookupInvoice:(hash:string)=>Promise<unknown>};
 // All dependencies/configuration are trusted server-side, never browser JSON.
 evidence:()=>Promise<{binding:string;readiness:WalletReadinessEvidence}>;
 fetchJson:(url:URL)=>Promise<unknown>;
 recovery?:{readonly ready:boolean;claim:(id:string)=>boolean|Promise<boolean>};
};
/** Isolated integration harness, NOT a live service. No default transport or
 * credentials. An explicit injected wallet is required, tests use fakes only. */
export class PayoutFlow {
 #policy:Policy;
 #worker:PayoutWorker;
 constructor(private ledger:PayoutLedger,private deps:Dependencies,policy:Policy,private now=()=>Math.floor(Date.now()/1000)){
  this.#policy=policySchema.parse(policy);
  if(deps.reader.walletRef!==deps.wallet.walletRef||deps.reader.binding!==policy.binding||deps.wallet.binding!==policy.binding)throw new Error("Wallet binding mismatch");
  ledger.bindWallet(deps.wallet.walletRef,policy.binding);
  this.#worker=new PayoutWorker(ledger,deps.wallet,async request=>{
   const p=this.#policy;if(this.now()>=p.expiresAt||BigInt(request.amountMsat)>BigInt(p.maximumPayoutMsat)||BigInt(request.maximumFeeMsat)>BigInt(p.maximumFeeMsat))return false;
   const e=await deps.evidence(),r=e.readiness;
   if(e.binding!==p.binding||r.connectionRef!==deps.wallet.walletRef||assessRustressWallet(r,this.now()).state!=="ready-for-authorized-test")return false;
   const network={mainnet:"bc",testnet:"tb",signet:"tb",regtest:"bcrt"}[r.network];
   return network===deps.wallet.network&&BigInt(r.policy.maximumTestPaymentMsat)>=BigInt(request.amountMsat)&&
    BigInt(r.policy.maximumFeeMsat)>=BigInt(request.maximumFeeMsat)&&BigInt(r.policy.maximumBudgetMsat)>=BigInt(p.budgetMsat);
  },now,async id=>this.now()<this.#policy.expiresAt&&deps.recovery?.ready===true&&
    ledger.claimWithinBudget(id,deps.wallet.walletRef,this.#policy.budgetMsat)&&await deps.recovery.claim(id)&&
    this.now()<this.#policy.expiresAt&&deps.recovery.ready);
 }
 /** Issuance must save a verified invoice snapshot before showing it publicly. */
 register(snapshot:IncomingSnapshot){if(snapshot.walletRef!==this.deps.reader.walletRef)throw new Error("Wallet mismatch");this.ledger.register(snapshot);}
 /** Notification/history entry is only a hint. Always perform exact wallet lookup. */
 async collect(hash:string){
  try{
   const snapshot=this.ledger.incoming(this.deps.reader.walletRef,hash);if(!snapshot)throw new Error();
   const row=await this.deps.reader.lookupInvoice(hash) as Record<string,unknown>;
   if(!row||row.type!=="incoming"||row.payment_hash!==hash||!Number.isSafeInteger(row.amount)||String(row.amount)!==snapshot.amountMsat)throw new Error();
   if(row.state!=="settled")return {state:"pending" as const};
   if(!Number.isSafeInteger(row.settled_at)||Number(row.settled_at)<=0||Number(row.settled_at)>this.now()+60||
    typeof row.preimage!=="string"||!/^[0-9a-f]{64}$/.test(row.preimage)||createHash("sha256").update(Buffer.from(row.preimage,"hex")).digest("hex")!==hash)throw new Error();
   return {state:"credited" as const,...this.ledger.settle(snapshot.walletRef,hash,snapshot.amountMsat)};
  }catch{throw new Error("Incoming settlement could not be verified");}
 }
 /** Recover missed notifications by rechecking registered unsettled invoices. */
 async sweep(after=0,limit=50){
  const rows=this.ledger.pendingIncoming(this.deps.reader.walletRef,after,limit);
  let credited=0,pending=0,failed=0;
  for(const row of rows){try{if((await this.collect(row.hash)).state==="credited")credited++;else pending++;}catch{failed++;}}
  // Start each new full scan at zero. Failed/pending rows remain in SQLite and
  // are revisited next cycle; cursor is navigation, not settlement evidence.
  return {cursor:rows.at(-1)?.cursor??after,done:rows.length<limit,credited,pending,failed};
 }
 /** Hash selects a saved city/destination version, not a caller-selected payee. */
 async prepare(hash:string,id:string){
  try{
   z.uuid().parse(id);
   const s=this.ledger.incoming(this.deps.wallet.walletRef,hash);if(!s)throw new Error();
   const {cityId,walletRef,destinationVersion,destination}=s,bucket={cityId,walletRef,destinationVersion,destination};
   const existing=this.ledger.workerInput(id);
   if(existing){if(JSON.stringify(existing.bucket)!==JSON.stringify(bucket))throw new Error();return this.ledger.status(id);}
   if(this.now()>=this.#policy.expiresAt)throw new Error();
   const invoice=await retrieveRecipientInvoice(destination,(min,max)=>{
    const cap=BigInt(max)<BigInt(this.#policy.maximumPayoutMsat)?max:this.#policy.maximumPayoutMsat;
    const amount=this.ledger.quote(bucket,min,cap);if(!amount)throw new Error();return amount;
   },this.deps.wallet.network,{fetchJson:this.deps.fetchJson,now:this.now});
   const native=(BigInt(invoice.amountMsat)+99n)/100n,fee=native>10000n?native:10000n;
   if(fee>BigInt(this.#policy.maximumFeeMsat))throw new Error();
   return this.#worker.prepare(bucket,id,invoice.paymentRequest,invoice.terms,String(fee));
  }catch{throw new Error("Payout preparation unavailable; obligation retained");}
 }
 run(id:string){return this.#worker.run(id);}
}
