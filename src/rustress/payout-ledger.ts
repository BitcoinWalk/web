import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";

const hex=z.string().regex(/^[0-9a-f]{64}$/);
const ref=z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const money=z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(v=>BigInt(v)<=2_100_000_000_000_000_000n);
const positive=money.refine(v=>BigInt(v)>0n);
const timestamp=z.number().int().safe().nonnegative();
const bucketSchema=z.object({cityId:z.uuid(),walletRef:ref,destinationVersion:z.number().int().safe().positive(),destination:z.string().min(3).max(500)}).strict();
const invoiceSchema=bucketSchema.extend({paymentHash:hex,amountMsat:positive}).strict();
export type PayoutBucket=z.infer<typeof bucketSchema>;
export type IncomingSnapshot=z.infer<typeof invoiceSchema>;
type Attempt={id:string;bucket:string;hash:string;amount:string;fee_cap:string;state:"prepared"|"unknown"|"paid"|"cancelled";fee:string|null;created_at:number};

/** Isolated accounting core, NOT connected to NWC, Rustress handlers or checkout.
 * Trusted collectors must validate incoming settlement and outgoing invoices.
 * All money is decimal msat text in SQLite and BigInt during calculation.
 * A send permission can be claimed once. Unknown outcomes NEVER release credit. */
export class PayoutLedger {
  constructor(private db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
    db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS bw_ledger_wallet_binding(wallet TEXT PRIMARY KEY,binding TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bw_ledger_destination(city TEXT NOT NULL,wallet TEXT NOT NULL,version INTEGER NOT NULL,bucket TEXT NOT NULL,PRIMARY KEY(city,wallet,version));
      CREATE TABLE IF NOT EXISTS bw_ledger_invoice(wallet TEXT NOT NULL,hash TEXT NOT NULL,snapshot TEXT NOT NULL,bucket TEXT NOT NULL,amount TEXT NOT NULL,settled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(wallet,hash));
      CREATE TABLE IF NOT EXISTS bw_ledger_credit(wallet TEXT NOT NULL,hash TEXT NOT NULL,organizer TEXT NOT NULL,retained TEXT NOT NULL,PRIMARY KEY(wallet,hash));
      CREATE TABLE IF NOT EXISTS bw_ledger_payout(id TEXT PRIMARY KEY,bucket TEXT NOT NULL,hash TEXT NOT NULL UNIQUE,amount TEXT NOT NULL,fee_cap TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('prepared','unknown','paid','cancelled')),fee TEXT,created_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS bw_ledger_payout_invoice(payout TEXT PRIMARY KEY,document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bw_ledger_allocation(payout TEXT NOT NULL,wallet TEXT NOT NULL,hash TEXT NOT NULL,amount TEXT NOT NULL,PRIMARY KEY(payout,wallet,hash));`);
    db.exec(`CREATE TABLE IF NOT EXISTS bw_ledger_migration(id TEXT PRIMARY KEY,source_bucket TEXT NOT NULL,target_bucket TEXT NOT NULL,amount TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bw_ledger_migration_source(migration TEXT NOT NULL,wallet TEXT NOT NULL,hash TEXT NOT NULL,amount TEXT NOT NULL,PRIMARY KEY(migration,wallet,hash));
      CREATE TABLE IF NOT EXISTS bw_ledger_migration_allocation(payout TEXT NOT NULL,migration TEXT NOT NULL,amount TEXT NOT NULL,PRIMARY KEY(payout,migration));`);
    const columns=db.prepare("PRAGMA table_info(bw_ledger_payout)").all() as {name:string}[];
    if(!columns.some(column=>column.name==="created_at"))db.exec("ALTER TABLE bw_ledger_payout ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0");
  }
  private transaction<T>(fn:()=>T):T{
    this.db.exec("BEGIN IMMEDIATE");
    try{const result=fn();this.db.exec("COMMIT");return result;}catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  private bucket(value:PayoutBucket){return JSON.stringify(bucketSchema.parse(value));}
  databasePath(){return String(this.db.prepare("PRAGMA database_list").all().find(row=>row.name==="main")?.file??"");}
  bindWallet(walletRef:string,binding:string){
    ref.parse(walletRef);hex.parse(binding);
    this.transaction(()=>{
      const old=this.db.prepare("SELECT binding FROM bw_ledger_wallet_binding WHERE wallet=?").get(walletRef);
      if(old&&old.binding!==binding)throw new Error("Wallet binding conflict");
      if(!old)this.db.prepare("INSERT INTO bw_ledger_wallet_binding VALUES(?,?)").run(walletRef,binding);
    });
  }
  incoming(walletRef:string,hash:string):IncomingSnapshot|null{
    const row=this.db.prepare("SELECT snapshot FROM bw_ledger_invoice WHERE wallet=? AND hash=?").get(walletRef,hash);
    return row?JSON.parse(row.snapshot as string):null;
  }
  incomingStatus(walletRef:string,hash:string){
    ref.parse(walletRef);hex.parse(hash);
    const row=this.db.prepare("SELECT settled FROM bw_ledger_invoice WHERE wallet=? AND hash=?").get(walletRef,hash) as {settled:number}|undefined;
    return row?{settled:row.settled===1}:null;
  }
  recoveryAttempts(walletRef:string){
    return (this.db.prepare("SELECT id,bucket FROM bw_ledger_payout ORDER BY id").all() as {id:string;bucket:string}[])
      .filter(row=>JSON.parse(row.bucket).walletRef===walletRef).map(row=>{
        const input=this.workerInput(row.id)!;
        const allocations=this.db.prepare("SELECT wallet,hash,amount FROM bw_ledger_allocation WHERE payout=? ORDER BY wallet,hash").all(row.id);
        const migrated=this.db.prepare("SELECT migration,amount FROM bw_ledger_migration_allocation WHERE payout=? ORDER BY migration").all(row.id);
        const commitment=createHash("sha256").update(JSON.stringify({id:row.id,bucket:input.bucket,hash:input.hash,amount:input.amount,feeCap:input.fee_cap,document:input.document,allocations,...(migrated.length?{migrated}:{})})).digest("hex");
        return {...input,commitment};
      });
  }
  quarantineAttempt(id:string){
    // Recovery-only: remove send eligibility without initiating a payment.
    this.db.prepare("UPDATE bw_ledger_payout SET state='unknown' WHERE id=? AND state='prepared'").run(id);
  }
  pendingIncoming(walletRef:string,after=0,limit=50){
    ref.parse(walletRef);z.number().int().safe().nonnegative().parse(after);z.number().int().min(1).max(100).parse(limit);
    return this.db.prepare("SELECT rowid AS cursor,hash FROM bw_ledger_invoice WHERE wallet=? AND settled=0 AND rowid>? ORDER BY rowid LIMIT ?").all(walletRef,after,limit) as {cursor:number;hash:string}[];
  }
  pendingPayoutIds(walletRef:string,limit=50){
    ref.parse(walletRef);z.number().int().min(1).max(100).parse(limit);
    return (this.db.prepare("SELECT id,bucket FROM bw_ledger_payout WHERE state IN ('prepared','unknown') ORDER BY rowid LIMIT ?").all(limit) as {id:string;bucket:string}[])
      .filter(row=>JSON.parse(row.bucket).walletRef===walletRef).map(row=>row.id);
  }
  operationalStatus(walletRef:string){
    ref.parse(walletRef);
    const invoice=this.db.prepare(`SELECT COUNT(*) count,SUM(CASE WHEN settled=0 THEN 1 ELSE 0 END) pending
      FROM bw_ledger_invoice WHERE wallet=?`).get(walletRef) as {count:number;pending:number|null};
    const rows=(this.db.prepare("SELECT state,bucket FROM bw_ledger_payout").all() as {state:Attempt["state"];bucket:string}[])
      .filter(row=>JSON.parse(row.bucket).walletRef===walletRef);
    const count=(state:Attempt["state"])=>rows.filter(row=>row.state===state).length;
    return {invoices:invoice.count,pendingIncoming:invoice.pending??0,prepared:count("prepared"),unknown:count("unknown"),paid:count("paid"),cancelled:count("cancelled")};
  }
  budgetUsage(walletRef:string,since=0){
    ref.parse(walletRef);timestamp.parse(since);
    const rows=(this.db.prepare("SELECT amount,fee_cap,fee,state,bucket FROM bw_ledger_payout WHERE state IN ('paid','unknown')").all() as Attempt[])
      .filter(row=>JSON.parse(row.bucket).walletRef===walletRef&&(row.state==="unknown"||row.created_at>=since));
    const used=rows.reduce((sum,row)=>sum+BigInt(row.amount)+BigInt(row.state==="paid"?row.fee!:row.fee_cap),0n);
    return {usedMsat:String(used),uncertain:rows.filter(row=>row.state==="unknown").length};
  }
  /** Private scheduler inventory. A source hash selects the immutable bucket;
   * destinations never come from notification or timer input. Buckets with an
   * unfinished attempt are resumed before another invoice can be requested. */
  payableBuckets(walletRef:string,limit=20){
    ref.parse(walletRef);z.number().int().min(1).max(50).parse(limit);
    const rows=this.db.prepare(`SELECT sources.bucket,MIN(sources.sourceHash) sourceHash FROM (SELECT i.bucket bucket,i.hash sourceHash FROM bw_ledger_invoice i
      JOIN bw_ledger_credit c ON c.wallet=i.wallet AND c.hash=i.hash
      WHERE i.wallet=? UNION ALL SELECT m.target_bucket bucket,MIN(s.hash) sourceHash FROM bw_ledger_migration m
      JOIN bw_ledger_migration_source s ON s.migration=m.id WHERE json_extract(m.target_bucket,'$.walletRef')=? GROUP BY m.target_bucket) sources
      WHERE NOT EXISTS(SELECT 1 FROM bw_ledger_payout p WHERE p.bucket=sources.bucket AND p.state IN ('prepared','unknown'))
      GROUP BY sources.bucket ORDER BY sourceHash LIMIT ?`).all(walletRef,walletRef,limit) as {bucket:string;sourceHash:string}[];
    return rows.map(row=>({bucket:bucketSchema.parse(JSON.parse(row.bucket)),sourceHash:hex.parse(row.sourceHash)}))
      .filter(row=>BigInt(this.balance(row.bucket).availableMsat)>=1000n);
  }
  /** Atomic wallet-wide period spending guard. Unknown sends remain counted
   * across every renewal boundary until exact wallet lookup resolves them. */
  claimWithinBudget(id:string,walletRef:string,budgetMsat:string,since=0){
    positive.parse(budgetMsat);timestamp.parse(since);
    return this.transaction(()=>{
      const current=this.attempt(id);
      if(!current||current.state!=="prepared"||JSON.parse(current.bucket).walletRef!==walletRef)return false;
      const rows=this.db.prepare("SELECT * FROM bw_ledger_payout WHERE state IN ('paid','unknown')").all() as Attempt[];
      const spent=rows.filter(r=>JSON.parse(r.bucket).walletRef===walletRef&&(r.state==="unknown"||r.created_at>=since)).reduce((sum,r)=>sum+BigInt(r.amount)+BigInt(r.state==="paid"?r.fee!:r.fee_cap),0n);
      if(spent+BigInt(current.amount)+BigInt(current.fee_cap)>BigInt(budgetMsat))return false;
      return this.claimSend(id);
    });
  }
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
    const invoices=rows.map(row=>{
      const allocations=this.db.prepare("SELECT a.amount FROM bw_ledger_allocation a JOIN bw_ledger_payout p ON p.id=a.payout WHERE a.wallet=? AND a.hash=? AND p.state!='cancelled'").all(row.wallet,row.hash) as {amount:string}[];
      const moved=this.db.prepare("SELECT s.amount FROM bw_ledger_migration_source s JOIN bw_ledger_migration m ON m.id=s.migration WHERE s.wallet=? AND s.hash=?").all(row.wallet,row.hash) as {amount:string}[];
      const available=BigInt(row.organizer)-allocations.reduce((s,a)=>s+BigInt(a.amount),0n)-moved.reduce((s,a)=>s+BigInt(a.amount),0n);
      if(available<0n)throw new Error("Ledger invariant violated");
      return {kind:"invoice" as const,...row,face:BigInt(row.organizer),available};
    });
    const migrated=(this.db.prepare("SELECT id,amount FROM bw_ledger_migration WHERE target_bucket=? ORDER BY id").all(bucket) as {id:string;amount:string}[]).map(row=>{
      const allocations=this.db.prepare("SELECT a.amount amount FROM bw_ledger_migration_allocation a JOIN bw_ledger_payout p ON p.id=a.payout WHERE a.migration=? AND p.state!='cancelled'").all(row.id) as {amount:string}[];
      const available=BigInt(row.amount)-allocations.reduce((s,a)=>s+BigInt(a.amount),0n);if(available<0n)throw new Error("Ledger invariant violated");
      return {kind:"migration" as const,id:row.id,face:BigInt(row.amount),available};
    });
    return [...invoices,...migrated];
  }
  balance(input:PayoutBucket){
    const bucket=this.bucket(input),credits=this.credits(bucket);
    const attempts=this.db.prepare("SELECT amount,state FROM bw_ledger_payout WHERE bucket=? AND state!='cancelled'").all(bucket) as {amount:string;state:string}[];
    return {earnedMsat:String(credits.reduce((s,c)=>s+c.face,0n)),availableMsat:String(credits.reduce((s,c)=>s+c.available,0n)),
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
  migrate(id:string,source:PayoutBucket,target:PayoutBucket,expectedAmountMsat:string){
    z.uuid().parse(id);positive.parse(expectedAmountMsat);const from=this.bucket(source),to=this.bucket(target);
    if(source.cityId!==target.cityId||source.walletRef!==target.walletRef||source.destinationVersion===target.destinationVersion||from===to)throw new Error("Invalid destination migration");
    return this.transaction(()=>{
      const existing=this.db.prepare("SELECT source_bucket,target_bucket,amount FROM bw_ledger_migration WHERE id=?").get(id) as {source_bucket:string;target_bucket:string;amount:string}|undefined;
      if(existing){if(existing.source_bucket!==from||existing.target_bucket!==to||existing.amount!==expectedAmountMsat)throw new Error("Destination migration conflict");return {amountMsat:existing.amount};}
      const sourceSaved=this.db.prepare("SELECT 1 FROM bw_ledger_destination WHERE city=? AND wallet=? AND version=? AND bucket=?").get(source.cityId,source.walletRef,source.destinationVersion,from);
      const targetSaved=this.db.prepare("SELECT 1 FROM bw_ledger_destination WHERE city=? AND wallet=? AND version=? AND bucket=?").get(target.cityId,target.walletRef,target.destinationVersion,to);
      if(!sourceSaved||!targetSaved||this.db.prepare("SELECT 1 FROM bw_ledger_payout WHERE bucket=? AND state IN ('prepared','unknown')").get(from))throw new Error("Destination migration unavailable");
      const credits=this.credits(from).filter(row=>row.kind==="invoice");const amount=credits.reduce((sum,row)=>sum+row.available,0n);
      if(amount!==BigInt(expectedAmountMsat))throw new Error("Destination migration amount changed");
      this.db.prepare("INSERT INTO bw_ledger_migration VALUES(?,?,?,?,?)").run(id,from,to,String(amount),this.now());
      for(const credit of credits)if(credit.available>0n)this.db.prepare("INSERT INTO bw_ledger_migration_source VALUES(?,?,?,?)").run(id,credit.wallet,credit.hash,String(credit.available));
      return {amountMsat:String(amount)};
    });
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
      this.db.prepare("INSERT INTO bw_ledger_payout(id,bucket,hash,amount,fee_cap,state,fee,created_at) VALUES(?,?,?,?,?,'prepared',NULL,?)").run(id,bucket,hash,amountMsat,feeCapMsat,this.now());
      if(invoiceDocument!==undefined)this.db.prepare("INSERT INTO bw_ledger_payout_invoice VALUES(?,?)").run(id,invoiceDocument);
      for(const credit of credits){
        const take=credit.available<remaining?credit.available:remaining;
        if(take>0n){if(credit.kind==="invoice")this.db.prepare("INSERT INTO bw_ledger_allocation VALUES(?,?,?,?)").run(id,credit.wallet,credit.hash,String(take));
        else this.db.prepare("INSERT INTO bw_ledger_migration_allocation VALUES(?,?,?)").run(id,credit.id,String(take));}
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
