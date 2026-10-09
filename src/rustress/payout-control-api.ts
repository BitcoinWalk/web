import {timingSafeEqual} from "node:crypto";
import {z} from "zod";
import type {PayoutLedger} from "./payout-ledger";
import type {PayoutInvoiceIntake} from "./payout-intake";
import type {PayoutInvoiceIssuer} from "./payout-invoice-issuer";
import type {PayoutAuthorityStore} from "./payout-authority";

const token=z.string().regex(/^[A-Za-z0-9_-]{43,256}$/);
type Result={status:number;body:Record<string,unknown>};
type AutomationState={running:boolean;ready:boolean;lastCycleAt?:number;lastCycleState?:"completed"|"blocked"|"paused";consecutiveFailures:number};

/** Authenticated loopback application boundary. Invoice intake contains invoice
 * facts only; payout destinations can enter solely through the separately
 * authenticated authority channel. */
export class PayoutControlApi{
 #tokens:{intake:string;issuer:string;receipt:string;authority:string;operations:string};
 constructor(private authority:PayoutAuthorityStore,private intake:PayoutInvoiceIntake,private ledger:PayoutLedger,private walletRef:string,
  private enabled:()=>boolean,private automation:()=>AutomationState,tokens:{intake:string;issuer:string;receipt:string;authority:string;operations:string},private issuer?:PayoutInvoiceIssuer){
  this.#tokens={intake:token.parse(tokens.intake),issuer:token.parse(tokens.issuer),receipt:token.parse(tokens.receipt),authority:token.parse(tokens.authority),operations:token.parse(tokens.operations)};
  if(new Set(Object.values(this.#tokens)).size!==5)throw new Error("Separate payout API credentials required");
 }
 private allowed(header:string|undefined,expected:string){
  if(!header?.startsWith("Bearer "))return false;const a=Buffer.from(header.slice(7)),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
 }
 async route(method:string|undefined,url:string|undefined,authorization:string|undefined,body?:unknown,transport:"tcp"|"receipt-evidence"="tcp"):Promise<Result>{
  try{
   if(method==="GET"&&url==="/health")return {status:200,body:{service:"bitcoinwalk-rustress-payout",state:this.enabled()?"armed":"disabled"}};
   if(method==="GET"&&url==="/v1/status"){
    if(!this.allowed(authorization,this.#tokens.operations))return {status:401,body:{error:"unauthorized"}};
    return {status:200,body:{service:"bitcoinwalk-rustress-payout",enabled:this.enabled(),authorityRecords:this.authority.count(),...this.ledger.operationalStatus(this.walletRef),...(this.issuer?.status()??{invoiceIssued:0,invoiceCreatedPendingIntake:0,invoiceOutcomesUnknown:0}),...this.automation()}};
   }
   if(method==="POST"&&url==="/v1/authority"){
    if(!this.allowed(authorization,this.#tokens.authority))return {status:401,body:{error:"unauthorized"}};
    return {status:200,body:this.authority.register(body)};
   }
   if(method==="POST"&&url==="/v1/invoices"){
    if(!this.allowed(authorization,this.#tokens.intake))return {status:401,body:{error:"unauthorized"}};
    if(!this.enabled())return {status:503,body:{error:"payout-intake-disabled"}};
    return {status:200,body:await this.intake.register(body)};
   }
   if(method==="POST"&&url==="/v1/invoices/issue"){
    if(!this.allowed(authorization,this.#tokens.issuer))return {status:401,body:{error:"unauthorized"}};
    if(!this.enabled()||!this.automation().ready||!this.issuer)return {status:503,body:{error:"invoice-issuer-disabled"}};
    return {status:200,body:await this.issuer.issue(body)};
   }
   if(method==="POST"&&url==="/v1/invoices/status"){
    if(!this.allowed(authorization,this.#tokens.issuer))return {status:401,body:{error:"unauthorized"}};
    if(!this.enabled()||!this.issuer)return {status:503,body:{error:"invoice-issuer-disabled"}};
    return {status:200,body:this.issuer.lookup(body)};
   }
   if(method==="POST"&&url==="/v1/receipts/evidence"&&transport==="receipt-evidence"){
    if(!this.allowed(authorization,this.#tokens.receipt))return {status:401,body:{error:"unauthorized"}};
    if(!this.enabled()||!this.issuer)return {status:503,body:{error:"receipt-evidence-disabled"}};
    return {status:200,body:await this.issuer.receiptEvidence(body)};
   }
   return {status:404,body:{error:"not-found"}};
  }catch{return {status:409,body:{error:"request-rejected"}};}
 }
}
