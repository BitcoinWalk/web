import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";

export const PRICE_MSAT=21_000_000;
export type Invoice={invoice:string;paymentHash:string;amountMsat:number;createdAt:number;expiresAt:number};
export type PaymentRow=Invoice & {id:string;cityId:string;owner:string;cityName:string;revisionId:string;status:"creating"|"creation-uncertain"|"pending"|"expired"|"paid";settledAt:number|null;checkedAt:number|null};
export type PaymentView=PaymentRow & {tier:"free"|"paid"};
export type PaymentWallet={makeInvoice:(description:string)=>Promise<Invoice>;lookupInvoice:(hash:string)=>Promise<Record<string,unknown>>};
export type VerifiedCity={cityId:string;cityName:string;owner:string;revisionId:string};

export class PaymentStore {
 readonly db:DatabaseSync;
 constructor(database:string|DatabaseSync){
  this.db=typeof database==="string"?new DatabaseSync(database):database;
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS payment_invoice(id TEXT PRIMARY KEY,cityId TEXT NOT NULL,owner TEXT NOT NULL,cityName TEXT NOT NULL,revisionId TEXT NOT NULL,
    invoice TEXT NOT NULL DEFAULT '',paymentHash TEXT UNIQUE,amountMsat INTEGER NOT NULL DEFAULT 21000000,
    createdAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,settledAt INTEGER,checkedAt INTEGER);
   CREATE UNIQUE INDEX IF NOT EXISTS payment_one_open_invoice ON payment_invoice(cityId) WHERE status IN ('creating','creation-uncertain','pending');
   CREATE TABLE IF NOT EXISTS payment_invoice_payout(invoiceId TEXT PRIMARY KEY,destinationVersion INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT NOT NULL,paymentHash TEXT NOT NULL UNIQUE,invoiceId TEXT NOT NULL,paidAt INTEGER NOT NULL);`);
 }
 rows():PaymentRow[]{return this.db.prepare("SELECT * FROM payment_invoice ORDER BY createdAt DESC,rowid DESC").all() as PaymentRow[];}
 forCity(cityId:string):PaymentRow[]{return this.db.prepare("SELECT * FROM payment_invoice WHERE cityId=? ORDER BY createdAt DESC,rowid DESC").all(cityId) as PaymentRow[];}
 entitled(cityId:string):boolean{return !!this.db.prepare("SELECT cityId FROM paid_city_entitlement WHERE cityId=?").get(cityId);}
 view(row:PaymentRow):PaymentView{return {...row,tier:this.entitled(row.cityId)?"paid":"free"};}
 settle(row:PaymentRow,settledAt:number,checkedAt:number){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.db.prepare("UPDATE payment_invoice SET status='paid',settledAt=?,checkedAt=? WHERE id=?").run(settledAt,checkedAt,row.id);
   this.db.prepare("INSERT OR IGNORE INTO paid_city_entitlement VALUES (?,?,?,?,?)").run(row.cityId,row.owner,row.paymentHash,row.id,settledAt);
   this.db.exec("COMMIT");
  }catch(error){this.db.exec("ROLLBACK");throw error;}
 }
}

/** Only one process owns this database. The durable creating row also prevents
 * duplicate invoices after crashes or an ambiguous NWC timeout. */
export class PaymentService {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(readonly store:PaymentStore,private wallet:PaymentWallet,private verifyCity:(cityId:string,revisionId:string)=>Promise<VerifiedCity>,private now=()=>Math.floor(Date.now()/1000)){}
 private exclusive<T>(work:()=>Promise<T>):Promise<T>{const next=this.tail.then(work,work);this.tail=next.catch(()=>{});return next;}
 create(owner:string,cityId:string,revisionId:string,destinationVersion?:number):Promise<PaymentView>{return this.exclusive(async()=>{
  const city=await this.verifyCity(cityId,revisionId);
  if(city.owner!==owner||city.cityId!==cityId||city.revisionId!==revisionId)throw new Error("Only the verified city creator can purchase this plan.");
  const history=this.store.forCity(cityId);
  if(history.some(row=>row.owner!==owner))throw new Error("City payment ownership requires operator review.");
  for(const row of history)if(row.paymentHash&&row.status!=="paid")await this.check(row);
  const rows=this.store.forCity(cityId),paid=rows.find(row=>row.status==="paid"),open=rows.find(row=>row.status!=="expired");
  if(paid)return this.store.view(paid);
  if(open){if(open.status!=="pending")throw new Error("Invoice creation needs operator recovery. No second invoice has been issued.");return this.store.view(open);}
  // Bound invoice creation even when repeatedly submitting fresh signed requests.
  if(rows.filter(row=>row.createdAt>this.now()-86400).length>=5)throw new Error("Invoice renewal limit reached. Try again tomorrow.");
  const id=randomUUID();
  this.store.db.exec("BEGIN IMMEDIATE");
  try{this.store.db.prepare("INSERT INTO payment_invoice(id,cityId,owner,cityName,revisionId,createdAt,status) VALUES(?,?,?,?,?,?,'creating')").run(id,cityId,owner,city.cityName,revisionId,this.now());
   if(destinationVersion!==undefined){if(!Number.isSafeInteger(destinationVersion)||destinationVersion<1)throw new Error("Invalid payout destination version");this.store.db.prepare("INSERT INTO payment_invoice_payout VALUES(?,?)").run(id,destinationVersion);}this.store.db.exec("COMMIT");
  }catch(error){this.store.db.exec("ROLLBACK");throw error;}
  try{
   const result=await this.wallet.makeInvoice(`BitcoinWalk lifetime city plan — ${city.cityName} — order ${id}`);
   if(result.amountMsat!==PRICE_MSAT||!/^[0-9a-f]{64}$/.test(result.paymentHash)||!result.invoice||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=this.now())throw new Error("Invalid invoice");
   this.store.db.prepare("UPDATE payment_invoice SET invoice=?,paymentHash=?,amountMsat=?,createdAt=?,expiresAt=?,status='pending' WHERE id=?").run(result.invoice,result.paymentHash,result.amountMsat,result.createdAt,result.expiresAt,id);
  }catch{
   this.store.db.prepare("UPDATE payment_invoice SET status='creation-uncertain' WHERE id=?").run(id);
   throw new Error("Invoice creation could not be confirmed. The order is saved for recovery; contact BitcoinWalk support.");
  }
  return this.store.view(this.store.forCity(cityId)[0]);
 });}
 private async check(row:PaymentRow){
  if(!row.paymentHash||row.status==="paid")return;
  const result=await this.wallet.lookupInvoice(row.paymentHash);
  if(result.payment_hash!==row.paymentHash||result.amount!==PRICE_MSAT||result.type!=="incoming")throw new Error("Wallet payment evidence did not match the stored invoice.");
  if(result.state==="settled"||(!result.state&&result.settled_at)){
   if(typeof result.settled_at!=="number"||!Number.isSafeInteger(result.settled_at)||result.settled_at<row.createdAt||result.settled_at>this.now()+60||typeof result.preimage!=="string"||!/^[0-9a-f]{64}$/.test(result.preimage)||createHash("sha256").update(Buffer.from(result.preimage,"hex")).digest("hex")!==row.paymentHash)throw new Error("Wallet settlement could not be verified.");
   this.store.settle(row,result.settled_at,this.now());
  }else{
   // A hold invoice is never treated as paid or safe to renew.
   const expired=result.state!=="accepted"&&(result.state==="expired"||row.expiresAt<=this.now());
   this.store.db.prepare("UPDATE payment_invoice SET status=?,checkedAt=? WHERE id=?").run(expired?"expired":"pending",this.now(),row.id);
  }
 }
 status(owner:string,cityId:string):Promise<PaymentView|null>{return this.exclusive(async()=>{
  const rows=this.store.forCity(cityId);if(rows.some(row=>row.owner!==owner))throw new Error("Payment access denied.");
  for(const row of rows)if(row.status!=="paid")await this.check(row);
  const current=this.store.forCity(cityId);return current.length?this.store.view(current.find(row=>row.status==="paid")??current[0]):null;
 });}
 /** Background settlement continues even when the organizer closes their browser. */
 reconcile():Promise<void>{return this.exclusive(async()=>{
  for(const row of this.store.rows().filter(row=>row.status==="pending"||(row.status==="expired"&&(!row.checkedAt||row.checkedAt<this.now()-86400))).sort((a,b)=>(a.checkedAt??0)-(b.checkedAt??0)).slice(0,100)){
   try{await this.check(row);}catch{console.warn("Payment lookup deferred; invoice remains recorded.");}
  }
 });}
 list(actor:string,superAdmin:string):PaymentView[]{return this.store.rows().filter(row=>actor===superAdmin||row.owner===actor).map(row=>this.store.view(row));}
}
