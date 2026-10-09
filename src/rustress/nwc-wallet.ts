import {decode} from "bolt11";
import {z} from "zod";
import {createHash} from "node:crypto";
import {PrivateNwcTransport,type CheckoutIdentity} from "./nwc-transport";
import type {PayoutWallet} from "./payout-worker";
const money=z.string().regex(/^(0|[1-9][0-9]{0,15})$/).refine(v=>BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER));
const permitSchema=z.object({binding:z.string(),paymentHash:z.string(),amountMsat:money,enforcedFeeCeilingMsat:money,
 checkedAt:z.number().int().safe(),expiresAt:z.number().int().safe(),authorized:z.literal(true)}).strict();
export type WalletSendPermit=z.infer<typeof permitSchema>;
type Request={binding:string;paymentHash:string;amountMsat:string;maximumFeeMsat:string};
/** Off by default. Trusted callback must attest wallet-enforced fees, budget,
 * deployment and authorization. No runtime provider is installed here. */
export class RustressNwcWallet implements PayoutWallet {
 #transport:PrivateNwcTransport;
 readonly binding:string;
 #attempted=new Set<string>();
 constructor(readonly walletRef:string,value:string,checkoutValue:CheckoutIdentity,readonly network:"bc"|"tb"|"bcrt",
  private permit:(request:Request)=>Promise<WalletSendPermit|null>=async()=>null,
  private enabled:()=>boolean=()=>false,private now=()=>Math.floor(Date.now()/1000)){
  this.#transport=new PrivateNwcTransport(walletRef,value,checkoutValue);this.binding=this.#transport.binding;
 }
 lookup(hash:string){return this.#transport.lookupPayout(hash);}
 async send(input:{invoice:string;maximumFeeMsat:string;paymentHash:string}){
  try{
   if(!this.enabled()||input.invoice.length>16384||this.#attempted.has(input.paymentHash)||this.#attempted.size>=10000)throw new Error();
   const cap=money.parse(input.maximumFeeMsat),invoice=decode(input.invoice),hash=invoice.tagsObject.payment_hash;
   const amount=money.parse(invoice.millisatoshis);
   if(!invoice.complete||BigInt(amount)<=0n||BigInt(amount)%1000n||invoice.network?.bech32!==this.network||
    !/^[0-9a-f]{64}$/.test(input.paymentHash)||hash!==input.paymentHash||invoice.tags.filter(t=>t.tagName==="payment_hash").length!==1||
    !Number.isSafeInteger(invoice.timeExpireDate)||invoice.timeExpireDate!<=this.now()+30)throw new Error();
   this.#attempted.add(input.paymentHash); // In-process guard; durable exclusion is ledger+journal.
   const p=permitSchema.parse(await this.permit({binding:this.binding,paymentHash:input.paymentHash,amountMsat:amount,maximumFeeMsat:cap}));
   const check=()=>{const time=this.now();
   if(!this.enabled()||p.binding!==this.binding||p.paymentHash!==hash||p.amountMsat!==amount||
    p.checkedAt>time||time-p.checkedAt>30||p.expiresAt<=time||invoice.timeExpireDate!<=time+30||BigInt(p.enforcedFeeCeilingMsat)>BigInt(cap))throw new Error();};
   check();
   const result=await this.#transport.call("pay_invoice",{invoice:input.invoice},check);
   if(typeof result.preimage!=="string"||!/^[0-9a-f]{64}$/.test(result.preimage)||
    createHash("sha256").update(Buffer.from(result.preimage,"hex")).digest("hex")!==hash)throw new Error();
   // Worker must still perform exact authenticated lookup before booking success.
  }catch{throw new Error("Payment outcome unconfirmed; reconcile before any further action");}
 }
}
