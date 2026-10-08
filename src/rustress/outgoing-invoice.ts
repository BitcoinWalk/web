import {createHash} from "node:crypto";
import {decode} from "bolt11";
import {z} from "zod";

const amount=z.string().regex(/^[1-9][0-9]{0,18}$/).refine(v=>BigInt(v)<=2_100_000_000_000_000_000n);
export const outgoingTermsSchema=z.object({
  amountMsat:amount,minMsat:amount,maxMsat:amount,
  network:z.enum(["bc","tb","bcrt"]),
  // Exact metadata bytes returned by the independently validated LNURL endpoint.
  metadata:z.string().min(1).max(16384),
}).strict();
export type OutgoingTerms=z.infer<typeof outgoingTermsSchema>;

/** Decode and recover the BOLT11 signature using the pinned dependency.
 * No network calls, invoice fetching or payments. Never trust callback amount/hash.
 * tb cannot distinguish signet from testnet; the wallet collector must bind chain. */
export function validateOutgoingInvoice(request:string,input:OutgoingTerms,now:number,allowExpired=false){
  try{
    const terms=outgoingTermsSchema.parse(input);
    if(!Number.isSafeInteger(now)||now<0||typeof request!=="string"||request.length>16384)throw new Error();
    const value=BigInt(terms.amountMsat);
    if(value%1000n!==0n||value<BigInt(terms.minMsat)||value>BigInt(terms.maxMsat))throw new Error();
    const metadata:unknown=JSON.parse(terms.metadata);
    if(!Array.isArray(metadata)||!metadata.every(row=>Array.isArray(row)&&row.length===2&&row.every(v=>typeof v==="string"))||
      !metadata.some(row=>row[0]==="text/plain"))throw new Error();
    const invoice=decode(request);
    const tags=(name:string)=>invoice.tags.filter(tag=>tag.tagName===name);
    const hash=invoice.tagsObject.payment_hash;
    const commitment=createHash("sha256").update(terms.metadata,"utf8").digest("hex");
    if(!invoice.complete||invoice.network?.bech32!==terms.network||invoice.millisatoshis!==terms.amountMsat||
      typeof hash!=="string"||!/^[0-9a-f]{64}$/.test(hash)||tags("payment_hash").length!==1||
      tags("purpose_commit_hash").length!==1||tags("description").length!==0||tags("expire_time").length>1||
      invoice.tagsObject.purpose_commit_hash!==commitment||!Number.isSafeInteger(invoice.timestamp)||
      invoice.timestamp!>now+60||!Number.isSafeInteger(invoice.timeExpireDate)||
      invoice.timeExpireDate!<=invoice.timestamp!||invoice.timeExpireDate!-invoice.timestamp!>86400||
      (!allowExpired&&invoice.timeExpireDate!<=now+30))throw new Error();
    return {paymentRequest:request,paymentHash:hash,amountMsat:terms.amountMsat,expiresAt:invoice.timeExpireDate!,terms};
  }catch{throw new Error("Outgoing invoice failed validation");}
}
