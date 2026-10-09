import {createHash,timingSafeEqual} from "node:crypto";
import {request as httpRequest} from "node:http";
import {z} from "zod";
import {PAYOUT_RECEIPT_EVIDENCE_API} from "./payout-invoice-issuer";
import type {ZapInvoiceEvidence,ZapReceiptClaim} from "./zap-receipt-authority";

const token=z.string().regex(/^[A-Za-z0-9_-]{43,256}$/),hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/);
const response=z.object({api:z.literal(PAYOUT_RECEIPT_EVIDENCE_API),cityId:z.uuid(),payoutVersion:z.number().int().safe().positive(),invoice:z.string().min(20).max(4096),
 paymentHash:hex,amountMsat:money,descriptionHash:hex,settledAt:z.number().int().safe().positive(),preimage:hex}).strict();

/** Unix-socket client used by the isolated receipt authority. The credential
 * grants no invoice issuance, destination changes or payment method. */
export class ReceiptEvidenceClient{
 constructor(private secret:string,private socketPath="/run/bitcoinwalk-payout-evidence/socket/evidence.sock",private timeoutMs=5000){
  token.parse(secret);if(!socketPath.startsWith("/")||timeoutMs<1000||timeoutMs>10000)throw new Error("Invalid receipt evidence socket");
 }
 async get(claim:ZapReceiptClaim):Promise<ZapInvoiceEvidence>{
  const descriptionHash=createHash("sha256").update(claim.zapRequest).digest("hex"),request={api:PAYOUT_RECEIPT_EVIDENCE_API,cityId:claim.cityId,payoutVersion:claim.payoutVersion,paymentHash:claim.paymentHash,amountMsat:claim.amountMsat,descriptionHash};
  try{
   const document=JSON.stringify(request),value=await new Promise<unknown>((resolve,reject)=>{const reply=httpRequest({socketPath:this.socketPath,path:"/v1/receipts/evidence",method:"POST",headers:{authorization:`Bearer ${this.secret}`,"content-type":"application/json","content-length":Buffer.byteLength(document)},timeout:this.timeoutMs},incoming=>{const chunks:Buffer[]=[];let size=0;incoming.on("data",chunk=>{const item=Buffer.from(chunk);size+=item.length;if(size>16384)incoming.destroy(new Error());else chunks.push(item);});incoming.on("error",reject);incoming.on("end",()=>{try{if(incoming.statusCode!==200)throw new Error();resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(new Error());}});});reply.on("timeout",()=>reply.destroy(new Error()));reply.on("error",reject);reply.end(document);});
   const proof=response.parse(value);
   if(proof.cityId!==claim.cityId||proof.payoutVersion!==claim.payoutVersion||proof.paymentHash!==claim.paymentHash||proof.amountMsat!==claim.amountMsat||
    !timingSafeEqual(Buffer.from(proof.descriptionHash,"hex"),Buffer.from(descriptionHash,"hex")))throw new Error();
   return proof;
  }catch{throw new Error("Receipt settlement could not be verified");}
 }
}
