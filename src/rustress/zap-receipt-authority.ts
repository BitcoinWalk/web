import {createHash} from "node:crypto";
import {isIP} from "node:net";
import type {DatabaseSync} from "node:sqlite";
import {decode} from "bolt11";
import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";

export const ZAP_RECEIPT_API="bitcoinwalk-zap-receipt-v1" as const;
const hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/),wss=z.string().url().refine(value=>{
 try{const url=new URL(value),host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");return url.protocol==="wss:"&&!url.username&&!url.password&&!url.hash&&!isIP(host)&&host!=="localhost"&&host.endsWith(".")===false;}catch{return false;}
});
const claimSchema=z.object({api:z.literal(ZAP_RECEIPT_API),cityId:z.uuid(),payoutVersion:z.number().int().safe().positive(),paymentHash:hex,
 recipientPubkey:hex,amountMsat:money,zapRequest:z.string().min(1).max(65536),lnurl:z.string().min(1).max(2048).optional()}).strict();
export type ZapReceiptClaim=z.infer<typeof claimSchema>;
export type ZapInvoiceEvidence={invoice:string;paymentHash:string;amountMsat:string;descriptionHash:string;settledAt:number;preimage:string};
export type ZapInvoiceUnsettled={state:"unsettled";invoice:string;paymentHash:string;amountMsat:string;descriptionHash:string;expiresAt:number;observedAt:number};
const ACTIVE_GLOBAL_LIMIT=1000,ACTIVE_CITY_LIMIT=64,RETAINED_GLOBAL_LIMIT=10000,RETAINED_CITY_LIMIT=1024;
const ACTIVE_GLOBAL_BYTES=64*1024*1024,ACTIVE_CITY_BYTES=4*1024*1024,RETAINED_GLOBAL_BYTES=256*1024*1024,RETAINED_CITY_BYTES=32*1024*1024;
const DORMANT_AFTER=86400,RECLAIM_AFTER=30*86400;
const MAX_ZAP_RELAY_HINTS=20;
const RECEIPT_RELAYS=["wss://nos.lol/","wss://relay.damus.io/","wss://relay.primal.net/","wss://relay.ditto.pub/"] as const;
class UnsettledInvoice extends Error {constructor(readonly dormant:boolean,readonly reclaimable:boolean){super("Invoice is not settled");}}
export type ZapReceiptSigner={publicKey:string;sign:(template:EventTemplate)=>Promise<Event>};
export type ZapReceiptPublisher={publish:(relays:string[],event:Event)=>Promise<string[]>};
type Row={claim:string;state:"prepared"|"signed"|"published";event:string|null;relays:string;published_relays:string|null};

function one(tags:string[][],name:string,required=false){
 const found=tags.filter(tag=>tag[0]===name);if(found.length>1||required&&found.length!==1)throw new Error();return found[0];
}
function coordinate(value:string){const first=value.indexOf(":"),second=value.indexOf(":",first+1);return first>0&&second===first+65&&/^\d+$/.test(value.slice(0,first))&&hex.safeParse(value.slice(first+1,second)).success&&value.slice(second+1).length>0;}
function relays(tags:string[][]){
 const tag=one(tags,"relays",true)!;if(tag.length<2||tag.length>MAX_ZAP_RELAY_HINTS+1)throw new Error();
 const values=tag.slice(1).map(value=>wss.parse(value)),normalized=values.map(value=>new URL(value).toString());if(new Set(normalized).size!==values.length)throw new Error();
 const approved=new Set<string>(RECEIPT_RELAYS),selected=normalized.filter(value=>approved.has(value)).slice(0,3);
 return selected.length>0?selected:[...RECEIPT_RELAYS].slice(0,3);
}
function parseZap(raw:string,claim:Pick<ZapReceiptClaim,"recipientPubkey"|"amountMsat"|"lnurl">,signerPubkey:string){
 let event:Event;try{event=JSON.parse(raw) as Event;}catch{throw new Error("Zap request rejected");}
 try{
  if(event.kind!==9734||!verifyEvent(event)||!Array.isArray(event.tags)||event.tags.length>64||event.content.length>4096)throw new Error();
  const p=one(event.tags,"p",true)!;if(p.length!==2||p[1]!==claim.recipientPubkey)throw new Error();
  const e=one(event.tags,"e"),a=one(event.tags,"a"),upper=one(event.tags,"P"),amount=one(event.tags,"amount"),lnurl=one(event.tags,"lnurl");
  if(e&&(e.length!==2||!hex.safeParse(e[1]).success)||a&&(a.length!==2||!coordinate(a[1]))||upper&&(upper.length!==2||upper[1]!==signerPubkey))throw new Error();
  if(amount&&(amount.length!==2||amount[1]!==claim.amountMsat)||lnurl&&(lnurl.length!==2||!claim.lnurl||lnurl[1]!==claim.lnurl))throw new Error();
  const destinations=relays(event.tags);
  const tags:string[][]=[["p",claim.recipientPubkey],["P",event.pubkey]];
  if(e)tags.push(["e",e[1]]);if(a)tags.push(["a",a[1]]);
  const kind=one(event.tags,"k");if(kind){if(kind.length!==2||!/^(0|[1-9][0-9]*)$/.test(kind[1]))throw new Error();tags.push(["k",kind[1]]);}
  return {event,destinations,tags};
 }catch{throw new Error("Zap request rejected");}
}
/** The authenticated provider calls this before invoice creation. The recipient,
 * amount and canonical LNURL must come from its active city record, not the zap. */
export function validateZapRequest(input:unknown,providerPubkey:string){
 hex.parse(providerPubkey);
 const context=z.object({recipientPubkey:hex,amountMsat:money,zapRequest:z.string().min(1).max(65536),lnurl:z.string().min(1).max(2048).optional()}).strict().parse(input);
 const parsed=parseZap(context.zapRequest,context,providerPubkey);
 return {descriptionHash:createHash("sha256").update(context.zapRequest).digest("hex"),relays:parsed.destinations};
}
function template(claim:ZapReceiptClaim,evidence:ZapInvoiceEvidence,tags:string[][]):EventTemplate{
 return {kind:9735,created_at:evidence.settledAt,content:"",tags:[...tags,["bolt11",evidence.invoice],["description",claim.zapRequest],["preimage",evidence.preimage]]};
}
function exactSigned(event:Event,expected:EventTemplate,pubkey:string){
 return event.pubkey===pubkey&&verifyEvent(JSON.parse(JSON.stringify(event)))&&event.kind===expected.kind&&event.created_at===expected.created_at&&event.content===expected.content&&JSON.stringify(event.tags)===JSON.stringify(expected.tags);
}

/** Private NIP-57 receipt boundary. It owns no wallet transport or city payout
 * destination. Settlement evidence and the signer are injected through separate
 * capabilities. The exact signed receipt is durable before relay publication. */
export class ZapReceiptAuthority{
 #retrying=false;
 #inflight=new Map<string,{claim:string;operation:Promise<{api:typeof ZAP_RECEIPT_API;state:"published";eventId:string;relays:string[]}>}>();
 constructor(private db:DatabaseSync,private signer:ZapReceiptSigner,private evidence:(claim:ZapReceiptClaim)=>Promise<ZapInvoiceEvidence|ZapInvoiceUnsettled|null>,private publisher:ZapReceiptPublisher){
  hex.parse(signer.publicKey);db.exec(`CREATE TABLE IF NOT EXISTS bw_zap_receipt(
   payment_hash TEXT PRIMARY KEY,claim TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('prepared','signed','published')),
   event TEXT,relays TEXT NOT NULL,published_relays TEXT);
   CREATE TABLE IF NOT EXISTS bw_zap_receipt_retry(payment_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS bw_zap_receipt_dormant(payment_hash TEXT PRIMARY KEY);`);
  const columns=db.prepare("PRAGMA table_info(bw_zap_receipt)").all() as {name:string}[];
  if(!columns.some(column=>column.name==="city_id"))db.exec("ALTER TABLE bw_zap_receipt ADD COLUMN city_id TEXT");
  db.exec("UPDATE bw_zap_receipt SET city_id=json_extract(claim,'$.cityId') WHERE city_id IS NULL");
  db.exec("CREATE INDEX IF NOT EXISTS bw_zap_receipt_city_state ON bw_zap_receipt(city_id,state)");
 }
 private row(hash:string){return this.db.prepare("SELECT claim,state,event,relays,published_relays FROM bw_zap_receipt WHERE payment_hash=?").get(hash) as Row|undefined;}
 private saved(row:Row){if(!row.event)throw new Error("Receipt unavailable");const event=JSON.parse(row.event) as Event;if(!verifyEvent(event)||event.pubkey!==this.signer.publicKey)throw new Error("Receipt unavailable");return event;}
 /** Persist before acknowledging intake. No settlement, signing or publication
  * happens here; an unpaid invoice can safely wait for the retry worker. */
 enqueue(input:unknown){
  const claim=claimSchema.parse(input),document=JSON.stringify(claim),old=this.row(claim.paymentHash);
  if(old){if(old.claim!==document)throw new Error("Zap receipt conflict");return {api:ZAP_RECEIPT_API,state:old.state,paymentHash:claim.paymentHash};}
  const parsed=parseZap(claim.zapRequest,claim,this.signer.publicKey);
  const usage=(where:string,...values:string[])=>this.db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(claim AS BLOB))),0) AS bytes FROM bw_zap_receipt WHERE state!='published' ${where}`).get(...values) as {count:number;bytes:number};
  const active="AND payment_hash NOT IN (SELECT payment_hash FROM bw_zap_receipt_dormant)",pending=usage(active),cityPending=usage(`${active} AND city_id=?`,claim.cityId),retained=usage(""),cityRetained=usage("AND city_id=?",claim.cityId),bytes=Buffer.byteLength(document);
  if(pending.count>=ACTIVE_GLOBAL_LIMIT||pending.bytes+bytes>ACTIVE_GLOBAL_BYTES||cityPending.count>=ACTIVE_CITY_LIMIT||cityPending.bytes+bytes>ACTIVE_CITY_BYTES||
   retained.count>=RETAINED_GLOBAL_LIMIT||retained.bytes+bytes>RETAINED_GLOBAL_BYTES||cityRetained.count>=RETAINED_CITY_LIMIT||cityRetained.bytes+bytes>RETAINED_CITY_BYTES)throw new Error("Receipt queue full");
  this.db.prepare("INSERT INTO bw_zap_receipt(payment_hash,claim,state,relays,city_id) VALUES(?,?,'prepared',?,?)").run(claim.paymentHash,document,JSON.stringify(parsed.destinations),claim.cityId);
  return {api:ZAP_RECEIPT_API,state:"prepared" as const,paymentHash:claim.paymentHash};
 }
 /** Bounded, restart-safe retries. Failures retain the original claim/event;
  * backoff is durable and one unavailable invoice does not block the queue. */
 async retryPending(now=Math.floor(Date.now()/1000),limit=10){
  if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error("Invalid retry bounds");
  if(this.#retrying)return {attempted:0,published:0};
  this.#retrying=true;let published=0;
  try{
   const rows=this.db.prepare("SELECT r.payment_hash,r.claim,COALESCE(q.attempts,0) AS attempts FROM bw_zap_receipt r LEFT JOIN bw_zap_receipt_retry q USING(payment_hash) WHERE r.state!='published' AND COALESCE(q.next_attempt,0)<=? ORDER BY COALESCE(q.next_attempt,0),r.rowid LIMIT ?").all(now,limit) as {payment_hash:string;claim:string;attempts:number}[];
   for(const row of rows){
    try{await this.issue(JSON.parse(row.claim));this.db.prepare("DELETE FROM bw_zap_receipt_retry WHERE payment_hash=?").run(row.payment_hash);published++;}
    catch(error){
     if(error instanceof UnsettledInvoice&&error.reclaimable){
      this.db.exec("BEGIN IMMEDIATE");try{const removed=this.db.prepare("DELETE FROM bw_zap_receipt WHERE payment_hash=? AND state='prepared'").run(row.payment_hash);if(removed.changes===1){this.db.prepare("DELETE FROM bw_zap_receipt_retry WHERE payment_hash=?").run(row.payment_hash);this.db.prepare("DELETE FROM bw_zap_receipt_dormant WHERE payment_hash=?").run(row.payment_hash);}this.db.exec("COMMIT");}catch(cause){this.db.exec("ROLLBACK");throw cause;}continue;
     }
     if(error instanceof UnsettledInvoice&&error.dormant)this.db.prepare("INSERT OR IGNORE INTO bw_zap_receipt_dormant VALUES(?)").run(row.payment_hash);
     const dormant=this.db.prepare("SELECT 1 FROM bw_zap_receipt_dormant WHERE payment_hash=?").get(row.payment_hash);
     const attempts=Math.min(row.attempts+1,1000),delay=dormant?86400:Math.min(3600,15*2**Math.min(attempts-1,8));this.db.prepare("INSERT INTO bw_zap_receipt_retry(payment_hash,attempts,next_attempt) VALUES(?,?,?) ON CONFLICT(payment_hash) DO UPDATE SET attempts=excluded.attempts,next_attempt=excluded.next_attempt").run(row.payment_hash,attempts,now+delay);
    }
   }
   return {attempted:rows.length,published};
  }finally{this.#retrying=false;}
 }
 async issue(input:unknown){
  let claim:ZapReceiptClaim;try{claim=claimSchema.parse(input);}catch{throw new Error("Zap receipt rejected");}
  const document=JSON.stringify(claim),active=this.#inflight.get(claim.paymentHash);if(active){if(active.claim!==document)throw new Error("Zap receipt conflict");return active.operation;}
  const operation=this.#issue(claim).finally(()=>this.#inflight.delete(claim.paymentHash));this.#inflight.set(claim.paymentHash,{claim:document,operation});return operation;
 }
 async #issue(claim:ZapReceiptClaim){
  const document=JSON.stringify(claim),old=this.row(claim.paymentHash);
  if(old&&old.claim!==document)throw new Error("Zap receipt conflict");
  let row=old;
  if(!row){this.enqueue(claim);row=this.row(claim.paymentHash)!;}
  if(row.state==="prepared"){
   const parsed=parseZap(claim.zapRequest,claim,this.signer.publicKey),proof=await this.evidence(claim);
   if(proof&&"state" in proof){
    const invoice=decode(proof.invoice);
    if(proof.state!=="unsettled"||proof.paymentHash!==claim.paymentHash||proof.amountMsat!==claim.amountMsat||proof.descriptionHash!==createHash("sha256").update(claim.zapRequest).digest("hex")||
     invoice.tagsObject.payment_hash!==claim.paymentHash||invoice.tagsObject.purpose_commit_hash!==proof.descriptionHash||invoice.millisatoshis!==claim.amountMsat||invoice.timeExpireDate!==proof.expiresAt||
     !Number.isSafeInteger(proof.observedAt)||proof.observedAt<=0)throw new Error("Unsettled evidence rejected");
    throw new UnsettledInvoice(proof.observedAt>=proof.expiresAt+DORMANT_AFTER,proof.observedAt>=proof.expiresAt+RECLAIM_AFTER);
   }
   if(!proof||proof.paymentHash!==claim.paymentHash||proof.amountMsat!==claim.amountMsat||!Number.isSafeInteger(proof.settledAt)||proof.settledAt<=0||
    createHash("sha256").update(claim.zapRequest).digest("hex")!==proof.descriptionHash||createHash("sha256").update(Buffer.from(proof.preimage,"hex")).digest("hex")!==proof.paymentHash)throw new Error("Settlement evidence rejected");
   const invoice=decode(proof.invoice);if(invoice.tagsObject.payment_hash!==proof.paymentHash||invoice.tagsObject.purpose_commit_hash!==proof.descriptionHash||invoice.millisatoshis!==proof.amountMsat)throw new Error("Settlement evidence rejected");
   this.db.prepare("DELETE FROM bw_zap_receipt_dormant WHERE payment_hash=?").run(claim.paymentHash);
   const expected=template(claim,proof,parsed.tags),signed=await this.signer.sign(expected);
   if(!exactSigned(signed,expected,this.signer.publicKey))throw new Error("Receipt signer rejected");
   this.db.prepare("UPDATE bw_zap_receipt SET state='signed',event=? WHERE payment_hash=? AND state='prepared'").run(JSON.stringify(signed),claim.paymentHash);row=this.row(claim.paymentHash)!;
  }
  const event=this.saved(row);if(row.state==="published")return {api:ZAP_RECEIPT_API,state:"published" as const,eventId:event.id,relays:z.array(wss).min(1).max(3).parse(JSON.parse(row.published_relays!))};
  const requested=z.array(wss).min(1).max(3).parse(JSON.parse(row.relays)),acknowledged=new Set((await this.publisher.publish(requested,event)).map(value=>new URL(wss.parse(value)).toString())),published=requested.filter(value=>acknowledged.has(new URL(value).toString()));
  if(published.length<1)throw new Error("Receipt publication pending");
  this.db.prepare("UPDATE bw_zap_receipt SET state='published',published_relays=? WHERE payment_hash=? AND state='signed'").run(JSON.stringify(published),claim.paymentHash);
  return {api:ZAP_RECEIPT_API,state:"published" as const,eventId:event.id,relays:published};
 }
 status(){const rows=this.db.prepare("SELECT state,COUNT(*) count FROM bw_zap_receipt GROUP BY state").all() as {state:Row["state"];count:number}[];return Object.fromEntries(rows.map(row=>[row.state,row.count]));}
}
