import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";

const hex=z.string().regex(/^[0-9a-f]{64}$/);
const ref=z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const money=z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(v=>BigInt(v)<=2_100_000_000_000_000_000n);
const positive=money.refine(v=>BigInt(v)>0n);
const bucketSchema=z.object({cityId:z.uuid(),walletRef:ref,destinationVersion:z.number().int().safe().positive(),destination:z.string().min(3).max(500)}).strict();
const invoiceSchema=bucketSchema.extend({paymentHash:hex,amountMsat:positive}).strict();
export type PayoutBucket=z.infer<typeof bucketSchema>;
export type IncomingSnapshot=z.infer<typeof invoiceSchema>;
type Attempt={id:string;bucket:string;hash:string;amount:string;fee_cap:string;state:"prepared"|"unknown"|"paid"|"cancelled";fee:string|null};

/** Isolated accounting core, NOT connected to NWC, Rustress handlers or checkout.
 * Trusted collectors must validate incoming settlement and outgoing invoices.
 * All money is decimal msat text in SQLite and BigInt during calculation.
 * A send permission can be claimed once. Unknown outcomes NEVER release credit. */
export class PayoutLedger {
  constructor(private db:DatabaseSync){
    db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS bw_ledger_destination(city TEXT NOT NULL,wallet TEXT NOT NULL,version INTEGER NOT NULL,bucket TEXT NOT NULL,PRIMARY KEY(city,wallet,version));
      CREATE TABLE IF NOT EXISTS bw_ledger_invoice(wallet TEXT NOT NULL,hash TEXT NOT NULL,snapshot TEXT NOT NULL,bucket TEXT NOT NULL,amount TEXT NOT NULL,settled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(wallet,hash));
      CREATE TABLE IF NOT EXISTS bw_ledger_credit(wallet TEXT NOT NULL,hash TEXT NOT NULL,organizer TEXT NOT NULL,retained TEXT NOT NULL,PRIMARY KEY(wallet,hash));
      CREATE TABLE IF NOT EXISTS bw_ledger_payout(id TEXT PRIMARY KEY,bucket TEXT NOT NULL,hash TEXT NOT NULL UNIQUE,amount TEXT NOT NULL,fee_cap TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('prepared','unknown','paid','cancelled')),fee TEXT);
      CREATE TABLE IF NOT EXISTS bw_ledger_payout_invoice(payout TEXT PRIMARY KEY,document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bw_ledger_allocation(payout TEXT NOT NULL,wallet TEXT NOT NULL,hash TEXT NOT NULL,amount TEXT NOT NULL,PRIMARY KEY(payout,wallet,hash));`);
  }
  private transaction<T>(fn:()=>T):T{
    this.db.exec("BEGIN IMMEDIATE");
    try{const result=fn();this.db.exec("COMMIT");return result;}catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  private bucket(value:PayoutBucket){return JSON.stringify(bucketSchema.parse(value));}
  /** Persist before exposing the receiving invoice. Retry cannot change its destination. */
  register(input:IncomingSnapshot){
    const s=invoiceSchema.parse(input),snapshot=JSON.stringify(s);
    const bucket=this.bucket({cityId:s.cityId,walletRef:s.walletRef,destinationVersion:s.destinationVersion,destination:s.destination});
    this.transaction(()=>{
      const destination=this.db.prepare("SELECT bucket FROM bw_ledger_destination WHERE city=? AND wallet=? AND version=?").get(s.cityId,s.walletRef,s.destinationVersion);
      if(destination&&destination.bucket!==bucket)throw new Error("Destination version conflict");
      if(!destination)this.db.prepare("INSERT INTO bw_ledger_destination VALUES(?,?,?,?)").run(s.cityId,s.walletRef,s.destinationVersion,bucket);
      const existing=this.db.prepare("SELECT snapshot FROM bw_ledger_invoice WHERE wallet=? AND hash=?").get(s.walletRef,s.paymentHash);
      if(existing){if(existing.snapshot!==snapshot)throw new Error("Invoice snapshot conflict");return;}
      this.db.prepare("INSERT INTO bw_ledger_invoice(wallet,hash,snapshot,bucket,amount) VALUES(?,?,?,?,?)").run(s.walletRef,s.paymentHash,snapshot,bucket,s.amountMsat);
    });
  }
  /** Caller must verify settlement through the bound receiving wallet first. */
  settle(walletRef:string,paymentHash:string,receivedMsat:string){
    ref.parse(walletRef);hex.parse(paymentHash);positive.parse(receivedMsat);
    return this.transaction(()=>{
      const invoice=this.db.prepare("SELECT amount,settled FROM bw_ledger_invoice WHERE wallet=? AND hash=?").get(walletRef,paymentHash);
      if(!invoice||invoice.amount!==receivedMsat)throw new Error("Settlement does not match saved invoice");
      const organizer=BigInt(receivedMsat)*79n/100n,retained=BigInt(receivedMsat)-organizer;
      if(!invoice.settled){
        this.db.prepare("INSERT INTO bw_ledger_credit VALUES(?,?,?,?)").run(walletRef,paymentHash,String(organizer),String(retained));
        this.db.prepare("UPDATE bw_ledger_invoice SET settled=1 WHERE wallet=? AND hash=?").run(walletRef,paymentHash);
      }
      return {organizerMsat:String(organizer),retainedMsat:String(retained)};
    });
  }
  private credits(bucket:string){
    const rows=this.db.prepare("SELECT i.wallet,i.hash,c.organizer FROM bw_ledger_invoice i JOIN bw_ledger_credit c ON c.wallet=i.wallet AND c.hash=i.hash WHERE i.bucket=? ORDER BY i.hash").all(bucket) as {wallet:string;hash:string;organizer:string}[];
    return rows.map(row=>{
      const allocations=this.db.prepare("SELECT a.amount FROM bw_ledger_allocation a JOIN bw_ledger_payout p ON p.id=a.payout WHERE a.wallet=? AND a.hash=? AND p.state!='cancelled'").all(row.wallet,row.hash) as {amount:string}[];
      const available=BigInt(row.organizer)-allocations.reduce((s,a)=>s+BigInt(a.amount),0n);
      if(available<0n)throw new Error("Ledger invariant violated");
      return {...row,available};
    });
  }
  balance(input:PayoutBucket){
    const bucket=this.bucket(input),credits=this.credits(bucket);
    const attempts=this.db.prepare("SELECT amount,state FROM bw_ledger_payout WHERE bucket=? AND state!='cancelled'").all(bucket) as {amount:string;state:string}[];
    return {earnedMsat:String(credits.reduce((s,c)=>s+BigInt(c.organizer),0n)),availableMsat:String(credits.reduce((s,c)=>s+c.available,0n)),
      paidMsat:String(attempts.filter(a=>a.state==="paid").reduce((s,a)=>s+BigInt(a.amount),0n)),
      reservedMsat:String(attempts.filter(a=>a.state!=="paid").reduce((s,a)=>s+BigInt(a.amount),0n))};
  }
  accounting(input:PayoutBucket){
    const bucket=this.bucket(input);
    const credits=this.db.prepare("SELECT i.amount,c.organizer,c.retained FROM bw_ledger_invoice i JOIN bw_ledger_credit c ON c.wallet=i.wallet AND c.hash=i.hash WHERE i.bucket=?").all(bucket) as {amount:string;organizer:string;retained:string}[];
    const fees=this.db.prepare("SELECT fee FROM bw_ledger_payout WHERE bucket=? AND state='paid'").all(bucket) as {fee:string}[];
    const retained=credits.reduce((s,c)=>s+BigInt(c.retained),0n),fee=fees.reduce((s,f)=>s+BigInt(f.fee),0n);
    return {receivedMsat:String(credits.reduce((s,c)=>s+BigInt(c.amount),0n)),organizerMsat:String(credits.reduce((s,c)=>s+BigInt(c.organizer),0n)),
      retainedBeforeFeesMsat:String(retained),paidFeesMsat:String(fee),retainedAfterPaidFeesMsat:String(retained-fee)};
  }
  /** Suggest only a whole-satoshi amount within recipient limits. Dust stays owed. */
  quote(input:PayoutBucket,minMsat:string,maxMsat:string){
    positive.parse(minMsat);positive.parse(maxMsat);
    if(BigInt(minMsat)>BigInt(maxMsat))throw new Error("Invalid recipient limits");
    const available=BigInt(this.balance(input).availableMsat),maximum=BigInt(maxMsat);
    const amount=(available<maximum?available:maximum)/1000n*1000n;
    return amount>=BigInt(minMsat)&&amount>0n?String(amount):null;
  }
  /** The worker validates the exact BOLT11 and supplies its document here.
   * A stale quote cannot overdraw credits; allocation and attempt are atomic. */
  reserve(input:PayoutBucket,id:string,hash:string,amountMsat:string,feeCapMsat:string,invoiceDocument?:string){
    const bucket=this.bucket(input);z.uuid().parse(id);hex.parse(hash);positive.parse(amountMsat);money.parse(feeCapMsat);
    if(BigInt(amountMsat)%1000n!==0n)throw new Error("Payout must use whole satoshis");
    this.transaction(()=>{
      const existing=this.attempt(id);
      if(existing){if(existing.bucket!==bucket||existing.hash!==hash||existing.amount!==amountMsat||existing.fee_cap!==feeCapMsat||existing.state==="cancelled"||this.invoiceDocument(id)!==invoiceDocument)throw new Error("Payout attempt conflict");return;}
      const credits=this.credits(bucket);let remaining=BigInt(amountMsat);
      if(credits.reduce((s,c)=>s+c.available,0n)<remaining)throw new Error("Insufficient unreserved obligation");
      this.db.prepare("INSERT INTO bw_ledger_payout VALUES(?,?,?,?,?,'prepared',NULL)").run(id,bucket,hash,amountMsat,feeCapMsat);
      if(invoiceDocument!==undefined)this.db.prepare("INSERT INTO bw_ledger_payout_invoice VALUES(?,?)").run(id,invoiceDocument);
      for(const credit of credits){
        const take=credit.available<remaining?credit.available:remaining;
        if(take>0n)this.db.prepare("INSERT INTO bw_ledger_allocation VALUES(?,?,?,?)").run(id,credit.wallet,credit.hash,String(take));
        remaining-=take;if(remaining===0n)break;
      }
    });
  }
  private attempt(id:string){return this.db.prepare("SELECT * FROM bw_ledger_payout WHERE id=?").get(id) as Attempt|undefined;}
  private invoiceDocument(id:string){return this.db.prepare("SELECT document FROM bw_ledger_payout_invoice WHERE payout=?").get(id)?.document as string|undefined;}
  /** Private worker input; do not expose destinations or invoices through public status. */
  workerInput(id:string){const row=this.attempt(id);return row?{...row,bucket:JSON.parse(row.bucket) as PayoutBucket,document:this.invoiceDocument(id)}:null;}
  /** Commit UNKNOWN before sending. A crashed worker is recovered by lookup only. */
  claimSend(id:string){
    return this.db.prepare("UPDATE bw_ledger_payout SET state='unknown' WHERE id=? AND state='prepared'").run(id).changes===1;
  }
  cancelUnsent(id:string){
    if(this.db.prepare("UPDATE bw_ledger_payout SET state='cancelled' WHERE id=? AND state='prepared'").run(id).changes!==1)throw new Error("Only an unsent attempt can release its allocation");
  }
  /** A matching preimage plus trusted exact wallet lookup confirms the debit.
   * Preimage is verified in memory, never persisted. Fees do not reduce the 79%.
   * Even an excessive fee must record paid, never trigger another payout. */
  confirmPaid(id:string,walletRef:string,paymentHash:string,amountMsat:string,feeMsat:string,preimage:string){
    ref.parse(walletRef);hex.parse(paymentHash);positive.parse(amountMsat);money.parse(feeMsat);hex.parse(preimage);
    return this.transaction(()=>{
      const row=this.attempt(id);
      if(!row||!["unknown","paid"].includes(row.state)||JSON.parse(row.bucket).walletRef!==walletRef||row.hash!==paymentHash||row.amount!==amountMsat||
        createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex")!==paymentHash)throw new Error("Payout confirmation mismatch");
      if(row.state==="paid"&&row.fee!==feeMsat)throw new Error("Payout fee evidence conflict");
      this.db.prepare("UPDATE bw_ledger_payout SET state='paid',fee=? WHERE id=?").run(feeMsat,id);
      return {state:"paid" as const,feeLimitExceeded:BigInt(feeMsat)>BigInt(row.fee_cap)};
    });
  }
  status(id:string){const row=this.attempt(id);return row?{state:row.state,amountMsat:row.amount,feeMsat:row.fee,
    feeLimitExceeded:row.fee!==null&&BigInt(row.fee)>BigInt(row.fee_cap)}:null;}
}
