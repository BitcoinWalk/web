import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";

export const PRICE_MSAT=21_000_000;
export type Invoice={invoice:string;paymentHash:string;amountMsat:number;createdAt:number;expiresAt:number};
export type PaymentRow=Invoice & {id:string;cityId:string;owner:string;cityName:string;revisionId:string;status:"creating"|"creation-uncertain"|"pending"|"expired"|"paid";settledAt:number|null;checkedAt:number|null};
export type PaymentView=PaymentRow & {tier:"free"|"paid"};
export type GiftPaymentView={cityId:string;cityName:string;status:PaymentRow["status"];tier:"free"|"paid";invoice?:string;expiresAt:number};
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
   CREATE TABLE IF NOT EXISTS paid_city_entitlement(cityId TEXT PRIMARY KEY,owner TEXT NOT NULL,paymentHash TEXT NOT NULL UNIQUE,invoiceId TEXT NOT NULL,paidAt INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS pro_setup_task(cityId TEXT PRIMARY KEY,entitlementId TEXT NOT NULL UNIQUE,originalOwnerPubkey TEXT NOT NULL,currentOwnerPubkey TEXT NOT NULL,
    registrationVersion INTEGER,payoutVersion INTEGER,brandPubkey TEXT,brandVersion INTEGER NOT NULL DEFAULT 0,backupAcknowledgedAt INTEGER,
    artworkRevisionId TEXT,artworkAvatar TEXT,artworkBanner TEXT,artworkVersion INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS gift_city_checkout(tokenHash TEXT PRIMARY KEY,cityId TEXT NOT NULL,invoiceId TEXT NOT NULL,createdAt INTEGER NOT NULL);`);
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
   const entitlement=this.db.prepare("SELECT invoiceId,owner FROM paid_city_entitlement WHERE cityId=?").get(row.cityId) as {invoiceId:string;owner:string}|undefined;
   if(!entitlement||entitlement.invoiceId!==row.id||entitlement.owner!==row.owner)throw new Error("Paid city entitlement conflict requires operator review.");
   const payout=this.db.prepare("SELECT destinationVersion FROM payment_invoice_payout WHERE invoiceId=?").get(row.id) as {destinationVersion:number}|undefined;
   this.db.prepare(`INSERT OR IGNORE INTO pro_setup_task(cityId,entitlementId,originalOwnerPubkey,currentOwnerPubkey,registrationVersion,payoutVersion,state,createdAt,updatedAt)
    VALUES(?,?,?,?,?,NULL,'setup-required',?,?)`).run(row.cityId,row.id,row.owner,row.owner,payout?.destinationVersion??null,settledAt,settledAt);
   const task=this.db.prepare("SELECT entitlementId,registrationVersion FROM pro_setup_task WHERE cityId=?").get(row.cityId) as {entitlementId:string;registrationVersion:number|null}|undefined;
   if(!task||task.entitlementId!==row.id||task.registrationVersion!==(payout?.destinationVersion??null))throw new Error("Pro setup task conflict requires operator review.");
   this.db.exec("COMMIT");
  }catch(error){this.db.exec("ROLLBACK");throw error;}
 }
 gift(tokenHash:string,cityId:string){return this.db.prepare(`SELECT payment_invoice.* FROM gift_city_checkout
   JOIN payment_invoice ON payment_invoice.id=gift_city_checkout.invoiceId WHERE gift_city_checkout.tokenHash=? AND gift_city_checkout.cityId=?`).get(tokenHash,cityId) as PaymentRow|undefined;}
 bindGift(tokenHash:string,cityId:string,invoiceId:string,createdAt:number){
  const existing=this.db.prepare("SELECT cityId,invoiceId FROM gift_city_checkout WHERE tokenHash=?").get(tokenHash) as {cityId:string;invoiceId:string}|undefined;
  if(existing&&(existing.cityId!==cityId||existing.invoiceId!==invoiceId))throw new Error("Gift checkout token conflict.");
  this.db.prepare("INSERT OR IGNORE INTO gift_city_checkout VALUES(?,?,?,?)").run(tokenHash,cityId,invoiceId,createdAt);
 }
}

/** Only one process owns this database. The durable creating row also prevents
 * duplicate invoices after crashes or an ambiguous NWC timeout. */
export class PaymentService {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(readonly store:PaymentStore,private wallet:PaymentWallet,private verifyCity:(cityId:string,revisionId:string)=>Promise<VerifiedCity>,private now=()=>Math.floor(Date.now()/1000),
  private verifyGiftCity:(cityId:string,revisionId:string)=>Promise<VerifiedCity>=verifyCity){}
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
 private giftView(row:PaymentRow):GiftPaymentView{const view=this.store.view(row);return {cityId:row.cityId,cityName:row.cityName,status:row.status,tier:view.tier,
  ...(row.status==="pending"?{invoice:row.invoice}:{}),expiresAt:row.expiresAt};}
 createGift(tokenHash:string,cityId:string,revisionId:string):Promise<GiftPaymentView>{return this.exclusive(async()=>{
  if(!/^[a-f0-9]{64}$/.test(tokenHash))throw new Error("Gift checkout token required.");
  const existing=this.store.gift(tokenHash,cityId);if(existing){if(existing.status!=="paid")await this.check(existing);return this.giftView(this.store.forCity(cityId).find(row=>row.id===existing.id)!);}
  const city=await this.verifyGiftCity(cityId,revisionId),history=this.store.forCity(cityId);
  if(history.some(row=>row.owner!==city.owner))throw new Error("City payment ownership requires operator review.");
  for(const row of history)if(row.paymentHash&&row.status!=="paid")await this.check(row);
  const rows=this.store.forCity(cityId),paid=rows.find(row=>row.status==="paid"),open=rows.find(row=>row.status!=="expired");
  if(paid){this.store.bindGift(tokenHash,cityId,paid.id,this.now());return this.giftView(paid);}
  if(open){if(open.status!=="pending")throw new Error("Invoice creation needs operator recovery. No second invoice has been issued.");this.store.bindGift(tokenHash,cityId,open.id,this.now());return this.giftView(open);}
  if(rows.filter(row=>row.createdAt>this.now()-86400).length>=5)throw new Error("Invoice renewal limit reached. Try again tomorrow.");
  const id=randomUUID();this.store.db.exec("BEGIN IMMEDIATE");try{
   this.store.db.prepare("INSERT INTO payment_invoice(id,cityId,owner,cityName,revisionId,createdAt,status) VALUES(?,?,?,?,?,?,'creating')").run(id,city.cityId,city.owner,city.cityName,city.revisionId,this.now());
   this.store.bindGift(tokenHash,cityId,id,this.now());this.store.db.exec("COMMIT");
  }catch(error){this.store.db.exec("ROLLBACK");throw error;}
  try{const result=await this.wallet.makeInvoice(`BitcoinWalk gifted lifetime city plan — ${city.cityName} — order ${id}`);
   if(result.amountMsat!==PRICE_MSAT||!/^[0-9a-f]{64}$/.test(result.paymentHash)||!result.invoice||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=this.now())throw new Error();
   this.store.db.prepare("UPDATE payment_invoice SET invoice=?,paymentHash=?,amountMsat=?,createdAt=?,expiresAt=?,status='pending' WHERE id=?").run(result.invoice,result.paymentHash,result.amountMsat,result.createdAt,result.expiresAt,id);
  }catch{this.store.db.prepare("UPDATE payment_invoice SET status='creation-uncertain' WHERE id=?").run(id);throw new Error("Invoice creation could not be confirmed. The order is saved for recovery; contact BitcoinWalk support.");}
  return this.giftView(this.store.gift(tokenHash,cityId)!);
 });}
 giftStatus(tokenHash:string,cityId:string):Promise<GiftPaymentView>{return this.exclusive(async()=>{if(!/^[a-f0-9]{64}$/.test(tokenHash))throw new Error("Gift checkout token required.");const row=this.store.gift(tokenHash,cityId);if(!row)throw new Error("Gift checkout not found on this device.");if(row.status!=="paid")await this.check(row);return this.giftView(this.store.gift(tokenHash,cityId)!);});}
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
