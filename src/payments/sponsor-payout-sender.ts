import {createHash,randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import type {PayoutDestinationVersion} from "./payout-destination-store";
import {validateOutgoingInvoice,type OutgoingTerms} from "../rustress/outgoing-invoice";
import {retrieveRecipientInvoice} from "../rustress/recipient-invoice";
import type {PayoutWallet} from "../rustress/payout-worker";

const uuid=z.uuid(),hex=z.string().regex(/^[0-9a-f]{64}$/),ref=z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const money=z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(value=>BigInt(value)<=2_100_000_000_000_000_000n);
const positive=money.refine(value=>BigInt(value)>0n);

export type SponsorHostObligation={orderId:string;invitationId:string;cityId:string;hostPubkey:string;payoutVersion:number;receivedMsat:string;hostMsat:string;retainedMsat:string;state:"owed"|"unknown"|"paid"};
export type SponsorPayoutStatus={state:SponsorHostObligation["state"];amountMsat:string;attemptState:AttemptRow["state"]|null;feeMsat:string|null;feeLimitExceeded:boolean};
type AttemptRow={id:string;orderId:string;walletRef:string;destinationFingerprint:string;paymentHash:string;amountMsat:string;feeCapMsat:string;expiresAt:number;state:"prepared"|"unknown"|"paid"|"cancelled";invoiceDocument:string;feeMsat:string|null;createdAt:number;updatedAt:number};
export type SponsorPayoutAuthorization={obligation:SponsorHostObligation;destination:PayoutDestinationVersion;walletRef:string;paymentHash:string|null;amountMsat:string;maximumFeeMsat:string};
type RetrievedInvoice=ReturnType<typeof validateOutgoingInvoice>;

/** Durable sponsorship-only send ledger. It deliberately does not share credits,
 * attempts or wallet authority with the ordinary city-zap payout rail. */
export class SponsorPayoutStore{
 constructor(readonly db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
  db.exec(`CREATE TABLE IF NOT EXISTS sponsorship_host_payout_attempt(
    id TEXT PRIMARY KEY,orderId TEXT NOT NULL,walletRef TEXT NOT NULL,destinationFingerprint TEXT NOT NULL,
    paymentHash TEXT NOT NULL UNIQUE,amountMsat TEXT NOT NULL,feeCapMsat TEXT NOT NULL,expiresAt INTEGER NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('prepared','unknown','paid','cancelled')),
    invoiceDocument TEXT NOT NULL,feeMsat TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS sponsorship_host_payout_active_order
      ON sponsorship_host_payout_attempt(orderId) WHERE state IN ('prepared','unknown','paid');`);
 }
 private transaction<T>(work:()=>T){this.db.exec("BEGIN IMMEDIATE");try{const result=work();this.db.exec("COMMIT");return result;}catch(error){this.db.exec("ROLLBACK");throw error;}}
 obligation(orderId:string){
  uuid.parse(orderId);const row=this.db.prepare("SELECT * FROM sponsorship_host_obligation WHERE orderId=?").get(orderId) as SponsorHostObligation|undefined;
  if(!row)return null;uuid.parse(row.invitationId);uuid.parse(row.cityId);hex.parse(row.hostPubkey);positive.parse(row.receivedMsat);positive.parse(row.hostMsat);money.parse(row.retainedMsat);
  if(BigInt(row.hostMsat)!==BigInt(row.receivedMsat)*79n/100n||BigInt(row.hostMsat)+BigInt(row.retainedMsat)!==BigInt(row.receivedMsat))throw new Error("Sponsor obligation invariant violated");
  return row;
 }
 private row(id:string){return this.db.prepare("SELECT * FROM sponsorship_host_payout_attempt WHERE id=?").get(id) as AttemptRow|undefined;}
 active(orderId:string){uuid.parse(orderId);return this.db.prepare("SELECT * FROM sponsorship_host_payout_attempt WHERE orderId=? AND state IN ('prepared','unknown','paid') ORDER BY createdAt DESC LIMIT 1").get(orderId) as AttemptRow|undefined;}
 input(id:string){const row=this.row(uuid.parse(id));if(!row)return null;return {...row,document:JSON.parse(row.invoiceDocument) as {invoice:string;terms:OutgoingTerms}};}
 pending(limit=20){z.number().int().min(1).max(50).parse(limit);return (this.db.prepare(`SELECT o.orderId FROM sponsorship_host_obligation o
   WHERE o.state IN ('owed','unknown') AND (o.state='owed' OR EXISTS(SELECT 1 FROM sponsorship_host_payout_attempt a WHERE a.orderId=o.orderId AND a.state='unknown'))
   ORDER BY o.rowid LIMIT ?`).all(limit) as {orderId:string}[]).map(row=>row.orderId);}
 reserve(input:{id:string;orderId:string;walletRef:string;destinationFingerprint:string;paymentHash:string;amountMsat:string;feeCapMsat:string;expiresAt:number;invoice:string;terms:OutgoingTerms}){
  const parsed={id:uuid.parse(input.id),orderId:uuid.parse(input.orderId),walletRef:ref.parse(input.walletRef),destinationFingerprint:hex.parse(input.destinationFingerprint),paymentHash:hex.parse(input.paymentHash),amountMsat:positive.parse(input.amountMsat),feeCapMsat:money.parse(input.feeCapMsat)};
  if(BigInt(parsed.amountMsat)%1000n)throw new Error("Sponsor payout must use whole satoshis");
  const document=JSON.stringify({invoice:input.invoice,terms:input.terms}),time=this.now();
  return this.transaction(()=>{
   const obligation=this.obligation(parsed.orderId);if(!obligation||obligation.state!=="owed"||obligation.hostMsat!==parsed.amountMsat)throw new Error("Sponsor obligation is not payable");
   if(BigInt(parsed.feeCapMsat)>BigInt(obligation.retainedMsat))throw new Error("Sponsor payout fee cap exceeds retained share");
   if(!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=time)throw new Error("Sponsor payout invoice expired");
   const old=this.row(parsed.id);if(old){if(old.orderId!==parsed.orderId||old.walletRef!==parsed.walletRef||old.destinationFingerprint!==parsed.destinationFingerprint||old.paymentHash!==parsed.paymentHash||old.amountMsat!==parsed.amountMsat||old.feeCapMsat!==parsed.feeCapMsat||old.expiresAt!==input.expiresAt||old.invoiceDocument!==document||old.state==="cancelled")throw new Error("Sponsor payout attempt conflict");return old;}
   this.db.prepare("INSERT INTO sponsorship_host_payout_attempt VALUES(?,?,?,?,?,?,?,?, 'prepared',?,NULL,?,?)").run(parsed.id,parsed.orderId,parsed.walletRef,parsed.destinationFingerprint,parsed.paymentHash,parsed.amountMsat,parsed.feeCapMsat,input.expiresAt,document,time,time);
   return this.row(parsed.id)!;
  });
 }
 claim(id:string){
  return this.transaction(()=>{const row=this.row(uuid.parse(id));if(!row||row.state!=="prepared")return false;
   const obligation=this.obligation(row.orderId);if(!obligation||obligation.state!=="owed")return false;
   this.db.prepare("UPDATE sponsorship_host_payout_attempt SET state='unknown',updatedAt=? WHERE id=? AND state='prepared'").run(this.now(),id);
   this.db.prepare("UPDATE sponsorship_host_obligation SET state='unknown' WHERE orderId=? AND state='owed'").run(row.orderId);return true;});
 }
 /** Atomic wallet-wide lifetime limit. Unknown sends reserve their full fee cap;
  * confirmed sends use the exact fee returned by the bound wallet. */
 claimWithinBudget(id:string,walletRef:string,budgetMsat:string){
  ref.parse(walletRef);positive.parse(budgetMsat);
  return this.transaction(()=>{const row=this.row(uuid.parse(id));if(!row||row.state!=="prepared"||row.walletRef!==walletRef)return false;
   const obligation=this.obligation(row.orderId);if(!obligation||obligation.state!=="owed")return false;
   const attempts=this.db.prepare("SELECT amountMsat,feeCapMsat,feeMsat,state FROM sponsorship_host_payout_attempt WHERE walletRef=? AND state IN ('unknown','paid')").all(walletRef) as Pick<AttemptRow,"amountMsat"|"feeCapMsat"|"feeMsat"|"state">[];
   const used=attempts.reduce((sum,attempt)=>sum+BigInt(attempt.amountMsat)+BigInt(attempt.state==="paid"?attempt.feeMsat!:attempt.feeCapMsat),0n);
   if(used+BigInt(row.amountMsat)+BigInt(row.feeCapMsat)>BigInt(budgetMsat))return false;
   this.db.prepare("UPDATE sponsorship_host_payout_attempt SET state='unknown',updatedAt=? WHERE id=? AND state='prepared'").run(this.now(),id);
   this.db.prepare("UPDATE sponsorship_host_obligation SET state='unknown' WHERE orderId=? AND state='owed'").run(row.orderId);return true;});
 }
 budgetUsage(walletRef:string){
  ref.parse(walletRef);const attempts=this.db.prepare("SELECT amountMsat,feeCapMsat,feeMsat,state FROM sponsorship_host_payout_attempt WHERE walletRef=? AND state IN ('unknown','paid')").all(walletRef) as Pick<AttemptRow,"amountMsat"|"feeCapMsat"|"feeMsat"|"state">[];
  return {usedMsat:String(attempts.reduce((sum,attempt)=>sum+BigInt(attempt.amountMsat)+BigInt(attempt.state==="paid"?attempt.feeMsat!:attempt.feeCapMsat),0n)),uncertain:attempts.filter(attempt=>attempt.state==="unknown").length};
 }
 recoveryAttempts(walletRef:string){
  ref.parse(walletRef);return (this.db.prepare("SELECT * FROM sponsorship_host_payout_attempt WHERE walletRef=? ORDER BY createdAt,id").all(walletRef) as AttemptRow[]).map(row=>{
   const commitment=createHash("sha256").update(JSON.stringify({id:row.id,orderId:row.orderId,walletRef:row.walletRef,destinationFingerprint:row.destinationFingerprint,paymentHash:row.paymentHash,amountMsat:row.amountMsat,feeCapMsat:row.feeCapMsat,expiresAt:row.expiresAt,invoiceDocument:row.invoiceDocument})).digest("hex");
   return {id:row.id,orderId:row.orderId,state:row.state,hash:row.paymentHash,commitment};
  });
 }
 quarantineAttempt(id:string){
  return this.transaction(()=>{const row=this.row(uuid.parse(id));if(!row||row.state!=="prepared")return false;const obligation=this.obligation(row.orderId);if(!obligation||obligation.state!=="owed")return false;
   this.db.prepare("UPDATE sponsorship_host_payout_attempt SET state='unknown',updatedAt=? WHERE id=? AND state='prepared'").run(this.now(),id);
   this.db.prepare("UPDATE sponsorship_host_obligation SET state='unknown' WHERE orderId=? AND state='owed'").run(row.orderId);return true;});
 }
 cancelExpired(id:string){return this.transaction(()=>{const row=this.row(uuid.parse(id));if(!row||row.state!=="prepared")return false;this.db.prepare("UPDATE sponsorship_host_payout_attempt SET state='cancelled',updatedAt=? WHERE id=? AND state='prepared'").run(this.now(),id);return true;});}
 confirmPaid(id:string,result:{walletRef:string;paymentHash:string;amountMsat:string;feeMsat:string;preimage:string}){
  ref.parse(result.walletRef);hex.parse(result.paymentHash);positive.parse(result.amountMsat);money.parse(result.feeMsat);hex.parse(result.preimage);
  return this.transaction(()=>{const row=this.row(uuid.parse(id));if(!row||!["unknown","paid"].includes(row.state)||row.walletRef!==result.walletRef||row.paymentHash!==result.paymentHash||row.amountMsat!==result.amountMsat||createHash("sha256").update(Buffer.from(result.preimage,"hex")).digest("hex")!==result.paymentHash)throw new Error("Sponsor payout confirmation mismatch");
   const obligation=this.obligation(row.orderId);if(!obligation||!["unknown","paid"].includes(obligation.state)||obligation.hostMsat!==row.amountMsat)throw new Error("Sponsor obligation state mismatch");
   if(row.state==="paid"&&row.feeMsat!==result.feeMsat)throw new Error("Sponsor payout fee evidence conflict");
   this.db.prepare("UPDATE sponsorship_host_payout_attempt SET state='paid',feeMsat=?,updatedAt=? WHERE id=?").run(result.feeMsat,this.now(),id);
   this.db.prepare("UPDATE sponsorship_host_obligation SET state='paid' WHERE orderId=? AND state IN ('unknown','paid')").run(row.orderId);
   return {state:"paid" as const,feeLimitExceeded:BigInt(result.feeMsat)>BigInt(row.feeCapMsat)};});
 }
 status(orderId:string):SponsorPayoutStatus|null{const obligation=this.obligation(orderId),attempt=this.active(orderId);return obligation?{state:obligation.state,amountMsat:obligation.hostMsat,attemptState:attempt?.state??null,feeMsat:attempt?.feeMsat??null,feeLimitExceeded:attempt?.feeMsat!==null&&attempt?.feeMsat!==undefined&&BigInt(attempt.feeMsat)>BigInt(attempt.feeCapMsat)}:null;}
}

/** Restart-safe sender for paid host-invited sponsorships. The caller must supply
 * a dedicated outgoing wallet, a retained-share fee cap and fresh server-side
 * authorization. No browser request can choose a destination or invoice. */
export class SponsorPayoutSender{
 constructor(private store:SponsorPayoutStore,private destinations:{version:(cityId:string,version:number)=>PayoutDestinationVersion|null},private wallet:PayoutWallet,
  private authorize:(input:SponsorPayoutAuthorization)=>Promise<boolean>,private feeCap:(obligation:SponsorHostObligation)=>string,
  private options:{now?:()=>number;retrieve?:(destination:string,amountMsat:string,network:OutgoingTerms["network"])=>Promise<RetrievedInvoice>;claim?:(attemptId:string)=>boolean|Promise<boolean>}={}){}
 private now(){return (this.options.now??(()=>Math.floor(Date.now()/1000)))();}
 private destination(obligation:SponsorHostObligation){const value=this.destinations.version(obligation.cityId,obligation.payoutVersion);if(!value||value.ownerPubkey!==obligation.hostPubkey)throw new Error("Sponsor payout destination version mismatch");return value;}
 private authority(obligation:SponsorHostObligation,destination:PayoutDestinationVersion,paymentHash:string|null,maximumFeeMsat:string):SponsorPayoutAuthorization{return {obligation,destination,walletRef:this.wallet.walletRef,paymentHash,amountMsat:obligation.hostMsat,maximumFeeMsat};}
 async process(orderId:string):Promise<SponsorPayoutStatus|null>{
  try{
   let obligation=this.store.obligation(orderId);if(!obligation||obligation.state==="paid")return this.store.status(orderId);
   let attempt=this.store.active(orderId);
   if(!attempt&&obligation.state==="owed"){
    const destination=this.destination(obligation),maximumFeeMsat=money.parse(this.feeCap(obligation));
    if(BigInt(maximumFeeMsat)>BigInt(obligation.retainedMsat))throw new Error("Sponsor payout fee cap exceeds retained share");
    if(!await this.authorize(this.authority(obligation,destination,null,maximumFeeMsat)))return this.store.status(orderId);
    const retrieve=this.options.retrieve??((value,amount,network)=>retrieveRecipientInvoice(value,amount,network));
    const invoice=await retrieve(destination.normalized,obligation.hostMsat,this.wallet.network);
    attempt=this.store.reserve({id:randomUUID(),orderId,walletRef:this.wallet.walletRef,destinationFingerprint:createHash("sha256").update(`${destination.cityId}:${destination.version}:${destination.normalized}`).digest("hex"),paymentHash:invoice.paymentHash,amountMsat:invoice.amountMsat,feeCapMsat:maximumFeeMsat,expiresAt:invoice.expiresAt,invoice:invoice.paymentRequest,terms:invoice.terms});
   }
   if(!attempt)return this.store.status(orderId);
   const document=JSON.parse(attempt.invoiceDocument) as {invoice:string;terms:OutgoingTerms};
   const checked=validateOutgoingInvoice(document.invoice,document.terms,this.now(),true);
   if(checked.paymentHash!==attempt.paymentHash||checked.amountMsat!==attempt.amountMsat||attempt.walletRef!==this.wallet.walletRef||checked.terms.network!==this.wallet.network)throw new Error("Sponsor payout attempt mismatch");
   if(attempt.state==="prepared"){
    obligation=this.store.obligation(orderId)!;const destination=this.destination(obligation);
    const fingerprint=createHash("sha256").update(`${destination.cityId}:${destination.version}:${destination.normalized}`).digest("hex");
    if(fingerprint!==attempt.destinationFingerprint)throw new Error("Sponsor payout destination changed");
    if(attempt.expiresAt<=this.now()+30){this.store.cancelExpired(attempt.id);return this.process(orderId);}
    if(!await this.authorize(this.authority(obligation,destination,attempt.paymentHash,attempt.feeCapMsat)))return this.store.status(orderId);
    validateOutgoingInvoice(document.invoice,document.terms,this.now());
    if(await (this.options.claim?.(attempt.id)??this.store.claim(attempt.id))){try{await this.wallet.send({invoice:checked.paymentRequest,maximumFeeMsat:attempt.feeCapMsat,paymentHash:attempt.paymentHash});}catch{/* An ambiguous send is reconciled only by exact-hash lookup. */}}
   }
   attempt=this.store.active(orderId)!;if(attempt.state!=="unknown")return this.store.status(orderId);
   const result=await this.wallet.lookup(attempt.paymentHash);if(result.state==="paid")this.store.confirmPaid(attempt.id,result);
  }catch{/* Keep destinations, invoices, wallet errors and preimages private. */}
  try{return this.store.status(orderId);}catch{return null;}
 }
 async run(limit=20){for(const orderId of this.store.pending(limit))await this.process(orderId);}
}
