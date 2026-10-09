import {createHash} from "node:crypto";
import {isIP} from "node:net";
import type {DatabaseSync} from "node:sqlite";
import {decode} from "bolt11";
import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";

export const RECEIPT_SIGNER_API="bitcoinwalk-zap-signer-v1" as const;
const hex=z.string().regex(/^[0-9a-f]{64}$/);
const requestSchema=z.object({api:z.literal(RECEIPT_SIGNER_API),paymentHash:hex,template:z.object({kind:z.literal(9735),created_at:z.number().int().safe().positive(),content:z.literal(""),tags:z.array(z.array(z.string()).min(2).max(4)).min(5).max(8)}).strict()}).strict();
export type ReceiptSignerRequest=z.infer<typeof requestSchema>;
type Row={request:string;event:string};

function one(tags:string[][],name:string,required=true){
 const found=tags.filter(tag=>tag[0]===name);
 if(found.length>1||required&&found.length!==1)throw new Error();
 return found[0];
}
function optionalCopy(requestTags:string[][],name:string){
 const tag=one(requestTags,name,false);
 if(tag&&tag.length!==2)throw new Error();
 return tag;
}
function requestRelays(tags:string[][]){
 const tag=one(tags,"relays")!;if(tag.length<2||tag.length>4)throw new Error();
 const values=tag.slice(1).map(value=>{const url=new URL(value),host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");if(url.protocol!=="wss:"||url.username||url.password||url.hash||isIP(host)||host==="localhost"||host.endsWith("."))throw new Error();return url.toString();});
 if(new Set(values).size!==values.length)throw new Error();
}
function exactEvent(event:Event,template:EventTemplate,pubkey:string){
 return event.pubkey===pubkey&&verifyEvent(structuredClone(event))&&event.kind===template.kind&&event.created_at===template.created_at&&event.content===template.content&&JSON.stringify(event.tags)===JSON.stringify(template.tags);
}

/** Revalidates a complete receipt template without trusting the receipt worker.
 * The signer accepts only Bitcoin mainnet BOLT11 receipts whose exact zap
 * request, amount, payment hash and preimage all bind to one another. */
export function validateReceiptTemplate(input:unknown,providerPubkey:string,now=Math.floor(Date.now()/1000)){
 try{
  hex.parse(providerPubkey);
  const parsed=requestSchema.parse(input),template=parsed.template;
  if(template.created_at>now+30)throw new Error();
  const names=template.tags.map(tag=>tag[0]),allowed=new Set(["p","P","e","a","k","bolt11","description","preimage"]);
  if(names.some(name=>!allowed.has(name)))throw new Error();
  const p=one(template.tags,"p")!,sender=one(template.tags,"P")!,bolt=one(template.tags,"bolt11")!,description=one(template.tags,"description")!,preimage=one(template.tags,"preimage")!;
  if(p.length!==2||sender.length!==2||bolt.length!==2||description.length!==2||preimage.length!==2||!hex.safeParse(p[1]).success||!hex.safeParse(sender[1]).success||!hex.safeParse(preimage[1]).success)throw new Error();
  let request:Event;try{request=JSON.parse(description[1]) as Event;}catch{throw new Error();}
  if(request.kind!==9734||!verifyEvent(structuredClone(request))||request.pubkey!==sender[1]||request.content.length>4096||!Array.isArray(request.tags)||request.tags.length>64)throw new Error();
  requestRelays(request.tags);
  const requestP=one(request.tags,"p")!,amount=one(request.tags,"amount")!,provider=one(request.tags,"P",false);
  if(requestP.length!==2||requestP[1]!==p[1]||amount.length!==2||!/^[1-9][0-9]{0,15}$/.test(amount[1])||provider&&(provider.length!==2||provider[1]!==providerPubkey))throw new Error();
  const e=optionalCopy(request.tags,"e"),a=optionalCopy(request.tags,"a"),k=optionalCopy(request.tags,"k");
  if(e&&!hex.safeParse(e[1]).success||a&&!/^\d+:[0-9a-f]{64}:.+$/.test(a[1])||k&&!/^(0|[1-9][0-9]*)$/.test(k[1]))throw new Error();
  const expected:string[][]=[["p",p[1]],["P",request.pubkey]];
  if(e)expected.push(["e",e[1]]);if(a)expected.push(["a",a[1]]);if(k)expected.push(["k",k[1]]);
  expected.push(["bolt11",bolt[1]],["description",description[1]],["preimage",preimage[1]]);
  if(JSON.stringify(template.tags)!==JSON.stringify(expected))throw new Error();
  const descriptionHash=createHash("sha256").update(description[1]).digest("hex"),preimageHash=createHash("sha256").update(Buffer.from(preimage[1],"hex")).digest("hex"),invoice=decode(bolt[1]);
  if(!bolt[1].toLowerCase().startsWith("lnbc")||invoice.tagsObject.payment_hash!==parsed.paymentHash||invoice.tagsObject.payment_hash!==preimageHash||invoice.tagsObject.purpose_commit_hash!==descriptionHash||invoice.millisatoshis!==amount[1])throw new Error();
  return {request:parsed,template:template as EventTemplate};
 }catch{throw new Error("Receipt signing request rejected");}
}

/** Durable, idempotent signer state. No relay, HTTP, wallet or payout capability
 * is accepted here; the only injected authority is one local signing function. */
export class ReceiptSignerStore{
 #inflight=new Map<string,{request:string;operation:Promise<Event>}>();
 constructor(private db:DatabaseSync,readonly publicKey:string,private signEvent:(template:EventTemplate)=>Promise<Event>,private now=()=>Math.floor(Date.now()/1000)){
  hex.parse(publicKey);
  db.exec(`CREATE TABLE IF NOT EXISTS bw_receipt_signer(
   payment_hash TEXT PRIMARY KEY,request TEXT NOT NULL,event TEXT NOT NULL
  );`);
 }
 async sign(input:unknown){
  const checked=validateReceiptTemplate(input,this.publicKey,this.now()),document=JSON.stringify(checked.request),hash=checked.request.paymentHash;
  const active=this.#inflight.get(hash);if(active){if(active.request!==document)throw new Error("Receipt signing conflict");return active.operation;}
  const operation=this.#sign(hash,document,checked.template).finally(()=>this.#inflight.delete(hash));this.#inflight.set(hash,{request:document,operation});return operation;
 }
 async #sign(hash:string,document:string,template:EventTemplate){
  const old=this.db.prepare("SELECT request,event FROM bw_receipt_signer WHERE payment_hash=?").get(hash) as Row|undefined;
  if(old){
   if(old.request!==document)throw new Error("Receipt signing conflict");
   const event=JSON.parse(old.event) as Event;
   if(!exactEvent(event,template,this.publicKey))throw new Error("Stored receipt rejected");
   return event;
  }
  const event=await this.signEvent(template);
  if(!exactEvent(event,template,this.publicKey))throw new Error("Receipt signature rejected");
  try{this.db.prepare("INSERT INTO bw_receipt_signer(payment_hash,request,event) VALUES(?,?,?)").run(hash,document,JSON.stringify(event));}
  catch{
   const raced=this.db.prepare("SELECT request,event FROM bw_receipt_signer WHERE payment_hash=?").get(hash) as Row|undefined;
   if(!raced||raced.request!==document||raced.event!==JSON.stringify(event))throw new Error("Receipt signing conflict");
  }
  return event;
 }
}
