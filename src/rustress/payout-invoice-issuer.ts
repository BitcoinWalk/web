import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {decode} from "bolt11";
import {z} from "zod";
import type {PayoutInvoiceIntake} from "./payout-intake";
import type {PayoutBucket} from "./payout-ledger";

export const PAYOUT_ISSUE_API="bitcoinwalk-payout-issue-v1";
export const PAYOUT_RECEIPT_EVIDENCE_API="bitcoinwalk-zap-settlement-v1";
const hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/).refine(value=>BigInt(value)>=1000n&&BigInt(value)<=1_000_000_000n);
const requestSchema=z.object({api:z.literal(PAYOUT_ISSUE_API),requestId:z.uuid(),cityId:z.uuid(),payoutVersion:z.number().int().safe().positive(),
 amountMsat:money,descriptionHash:hex,requestedAt:z.number().int().safe().positive(),expirySeconds:z.number().int().min(60).max(86400)}).strict();
const receiptSchema=z.object({api:z.literal(PAYOUT_RECEIPT_EVIDENCE_API),cityId:z.uuid(),payoutVersion:z.number().int().safe().positive(),paymentHash:hex,
 amountMsat:money,descriptionHash:hex}).strict();
type Request=z.infer<typeof requestSchema>;
type Authority=PayoutBucket&{invoiceIssuance:"enabled"};
type Created={invoice:string;paymentHash:string;amountMsat:string;issuedAt:number;expiresAt:number};
type Wallet={makeInvoice:(input:{amountMsat:string;descriptionHash:string;expirySeconds:number})=>Promise<Record<string,unknown>>};
type Row={request:string;state:"prepared"|"created"|"unknown"|"issued";invoice:string|null;hash:string|null;issued_at:number|null;expires_at:number|null};

function validateInvoice(result:Record<string,unknown>,request:Request,now:number):Created{
 if(result.type!=="incoming"||String(result.amount)!==request.amountMsat||typeof result.invoice!=="string"||!result.invoice.startsWith("lnbc")||
  typeof result.payment_hash!=="string"||!hex.safeParse(result.payment_hash).success)throw new Error();
 const invoice=decode(result.invoice),hash=invoice.tagsObject.payment_hash,commitment=invoice.tagsObject.purpose_commit_hash;
 if(invoice.millisatoshis!==request.amountMsat||hash!==result.payment_hash||commitment!==request.descriptionHash||!invoice.timestamp||invoice.timestamp>now+30||
  invoice.timestamp<request.requestedAt-30||!invoice.timeExpireDate||invoice.timeExpireDate<=now+30||invoice.timeExpireDate>invoice.timestamp+request.expirySeconds+30)throw new Error();
 return {invoice:result.invoice,paymentHash:hash,amountMsat:request.amountMsat,issuedAt:invoice.timestamp,expiresAt:invoice.timeExpireDate};
}

/** Durable private invoice broker. A request is persisted before wallet RPC.
 * Ambiguous wallet outcomes are quarantined and never retried automatically.
 * A created invoice is committed to payout intake before it may be returned. */
export class PayoutInvoiceIssuer{
 #inflight=new Map<string,Promise<Created>>();
 constructor(private db:DatabaseSync,private intake:PayoutInvoiceIntake,private resolve:(cityId:string,payoutVersion:number)=>Promise<Authority|null>,private wallet:Wallet,
  private lookupIncoming:(hash:string)=>{settled:boolean}|null=()=>null,private now=()=>Math.floor(Date.now()/1000),private receiptLookup?:(hash:string)=>Promise<unknown>){
  db.exec(`CREATE TABLE IF NOT EXISTS bw_invoice_issue_request(
   id TEXT PRIMARY KEY,request TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('prepared','created','unknown','issued')),
   invoice TEXT,hash TEXT UNIQUE,issued_at INTEGER,expires_at INTEGER);
   UPDATE bw_invoice_issue_request SET state='unknown' WHERE state='prepared';`);
 }
 private row(id:string){return this.db.prepare("SELECT request,state,invoice,hash,issued_at,expires_at FROM bw_invoice_issue_request WHERE id=?").get(id) as Row|undefined;}
 private created(row:Row):Created{
  if(!row.invoice||!row.hash||!row.issued_at||!row.expires_at)throw new Error();
  const request=requestSchema.parse(JSON.parse(row.request));
  return {invoice:row.invoice,paymentHash:hex.parse(row.hash),amountMsat:request.amountMsat,issuedAt:row.issued_at,expiresAt:row.expires_at};
 }
 private async finish(request:Request,row:Row){
  const created=this.created(row);
  await this.intake.register({api:"bitcoinwalk-payout-invoice-v1",cityId:request.cityId,payoutVersion:request.payoutVersion,paymentHash:created.paymentHash,
   amountMsat:request.amountMsat,issuedAt:created.issuedAt,expiresAt:created.expiresAt});
  this.db.prepare("UPDATE bw_invoice_issue_request SET state='issued' WHERE id=? AND state IN ('created','issued')").run(request.requestId);
  return created;
 }
 async issue(input:unknown):Promise<Created>{
  let request:Request;try{request=requestSchema.parse(input);}catch{throw new Error("Invoice request rejected");}
  const existing=this.#inflight.get(request.requestId);if(existing)return existing;
  const operation=this.#issue(request).finally(()=>this.#inflight.delete(request.requestId));this.#inflight.set(request.requestId,operation);return operation;
 }
 async #issue(request:Request):Promise<Created>{
  const now=this.now();if(request.requestedAt>now+30||now-request.requestedAt>86400)throw new Error("Invoice request rejected");
  const document=JSON.stringify(request),old=this.row(request.requestId);
  if(old){if(old.request!==document||old.state==="unknown"||old.state==="prepared")throw new Error("Invoice outcome requires review");if(old.state==="created")return this.finish(request,old);return this.created(old);}
  const authority=await this.resolve(request.cityId,request.payoutVersion);
  if(!authority||authority.cityId!==request.cityId||authority.destinationVersion!==request.payoutVersion||authority.invoiceIssuance!=="enabled")throw new Error("Invoice request rejected");
  this.db.prepare("INSERT INTO bw_invoice_issue_request(id,request,state) VALUES(?,?,'prepared')").run(request.requestId,document);
  let created:Created;
  try{created=validateInvoice(await this.wallet.makeInvoice({amountMsat:request.amountMsat,descriptionHash:request.descriptionHash,expirySeconds:request.expirySeconds}),request,this.now());}
  catch{this.db.prepare("UPDATE bw_invoice_issue_request SET state='unknown' WHERE id=? AND state='prepared'").run(request.requestId);throw new Error("Invoice outcome requires review");}
  this.db.prepare("UPDATE bw_invoice_issue_request SET state='created',invoice=?,hash=?,issued_at=?,expires_at=? WHERE id=? AND state='prepared'")
   .run(created.invoice,created.paymentHash,created.issuedAt,created.expiresAt,request.requestId);
  return this.finish(request,this.row(request.requestId)!);
 }
 status(){
  const rows=this.db.prepare("SELECT state,COUNT(*) count FROM bw_invoice_issue_request GROUP BY state").all() as {state:Row["state"];count:number}[];
  const count=(state:Row["state"])=>rows.find(row=>row.state===state)?.count??0;
  return {invoiceIssued:count("issued"),invoiceCreatedPendingIntake:count("created"),invoiceOutcomesUnknown:count("unknown")+count("prepared")};
 }
 lookup(input:unknown){
  try{
   const request=z.object({api:z.literal(PAYOUT_ISSUE_API),cityId:z.uuid(),payoutVersion:z.number().int().safe().positive(),paymentHash:hex}).strict().parse(input);
   const row=this.db.prepare("SELECT request,state,invoice,hash,issued_at,expires_at FROM bw_invoice_issue_request WHERE hash=?").get(request.paymentHash) as Row|undefined;
   if(!row||row.state!=="issued")throw new Error();const saved=requestSchema.parse(JSON.parse(row.request));
   if(saved.cityId!==request.cityId||saved.payoutVersion!==request.payoutVersion)throw new Error();const status=this.lookupIncoming(request.paymentHash);if(!status)throw new Error();
   return {api:PAYOUT_ISSUE_API,paymentHash:request.paymentHash,settled:status.settled};
  }catch{throw new Error("Invoice status unavailable");}
 }
 async receiptEvidence(input:unknown){
  try{
   if(!this.receiptLookup)throw new Error();const claim=receiptSchema.parse(input),row=this.db.prepare("SELECT request,state,invoice,hash,issued_at,expires_at FROM bw_invoice_issue_request WHERE hash=?").get(claim.paymentHash) as Row|undefined;
   if(!row||row.state!=="issued")throw new Error();const saved=requestSchema.parse(JSON.parse(row.request)),created=this.created(row);
   if(saved.cityId!==claim.cityId||saved.payoutVersion!==claim.payoutVersion||saved.amountMsat!==claim.amountMsat||saved.descriptionHash!==claim.descriptionHash)throw new Error();
   const result=await this.receiptLookup(claim.paymentHash) as Record<string,unknown>;
   if(!result||result.type!=="incoming"||result.state!=="settled"||result.payment_hash!==created.paymentHash||result.invoice!==created.invoice||String(result.amount)!==created.amountMsat||
    !Number.isSafeInteger(result.settled_at)||Number(result.settled_at)<created.issuedAt||Number(result.settled_at)>this.now()+30||typeof result.preimage!=="string"||!hex.safeParse(result.preimage).success||
    createHash("sha256").update(Buffer.from(result.preimage,"hex")).digest("hex")!==created.paymentHash)throw new Error();
   return {api:PAYOUT_RECEIPT_EVIDENCE_API,cityId:saved.cityId,payoutVersion:saved.payoutVersion,invoice:created.invoice,paymentHash:created.paymentHash,
    amountMsat:created.amountMsat,descriptionHash:saved.descriptionHash,settledAt:Number(result.settled_at),preimage:result.preimage};
  }catch{throw new Error("Receipt settlement unavailable");}
 }
}
