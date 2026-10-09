import {z} from "zod";
import {PayoutLedger,type PayoutBucket} from "./payout-ledger";

export const PAYOUT_INVOICE_API="bitcoinwalk-payout-invoice-v1";
const money=z.string().regex(/^[1-9][0-9]{0,15}$/).refine(value=>BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER));
const requestSchema=z.object({api:z.literal(PAYOUT_INVOICE_API),cityId:z.uuid(),payoutVersion:z.number().int().safe().positive(),
 paymentHash:z.string().regex(/^[0-9a-f]{64}$/),amountMsat:money,issuedAt:z.number().int().safe().positive(),expiresAt:z.number().int().safe().positive()}).strict();
const bucketSchema=z.object({cityId:z.uuid(),walletRef:z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),destinationVersion:z.number().int().safe().positive(),destination:z.string().min(3).max(500)}).strict();
export type PayoutInvoiceRequest=z.infer<typeof requestSchema>;

/** Private issuance boundary. Rustress supplies invoice facts only; the payout
 * destination is resolved from current signed/private BitcoinWalk authority. */
export class PayoutInvoiceIntake {
 constructor(private ledger:PayoutLedger,private resolve:(cityId:string,payoutVersion:number)=>Promise<PayoutBucket|null>,private now=()=>Math.floor(Date.now()/1000)){}
 async register(input:unknown){
  try{
   const request=requestSchema.parse(input),time=this.now();
   if(request.issuedAt>time+30||time-request.issuedAt>300||request.expiresAt<=time+30||request.expiresAt<=request.issuedAt||request.expiresAt-request.issuedAt>86400)throw new Error();
   const bucket=bucketSchema.parse(await this.resolve(request.cityId,request.payoutVersion));
   if(bucket.cityId!==request.cityId||bucket.destinationVersion!==request.payoutVersion)throw new Error();
   this.ledger.register({...bucket,paymentHash:request.paymentHash,amountMsat:request.amountMsat});
   return {api:PAYOUT_INVOICE_API,state:"recorded" as const,cityId:request.cityId,payoutVersion:request.payoutVersion,paymentHash:request.paymentHash};
  }catch{throw new Error("Incoming invoice could not be recorded");}
 }
}
