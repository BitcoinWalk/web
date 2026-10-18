import {createHash} from "node:crypto";
import {decode} from "bolt11";
import {z} from "zod";

const amount=z.string().regex(/^[1-9][0-9]{0,18}$/).refine(v=>BigInt(v)<=2_100_000_000_000_000_000n);
export const outgoingTermsSchema=z.object({
  amountMsat:amount,minMsat:amount,maxMsat:amount,
  network:z.enum(["bc","tb","bcrt"]),
  // Exact metadata bytes returned by the independently validated LNURL endpoint.
  metadata:z.string().min(1).max(16384),
  providerPolicy:z.literal("wallet-of-satoshi-v1").optional(),
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
    if(!Array.isArray(metadata)||!metadata.every(row=>Array.isArray(row)&&row.length===2&&row.every(v=>typeof v==="string")))throw new Error();
    const description=metadata.find(row=>row[0]==="text/plain")?.[1],identifier=metadata.find(row=>row[0]==="text/identifier")?.[1];
    if(typeof description!=="string")throw new Error();
    const invoice=decode(request);
    const tags=(name:string)=>invoice.tags.filter(tag=>tag.tagName===name);
    const hash=invoice.tagsObject.payment_hash;
    const commitment=createHash("sha256").update(terms.metadata,"utf8").digest("hex");
    const providerCompatible=terms.providerPolicy==="wallet-of-satoshi-v1"&&typeof identifier==="string"&&
      /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@walletofsatoshi\.com$/.test(identifier)&&description===`Wallet of Satoshi: ${identifier.slice(0,identifier.indexOf("@"))}`&&
      tags("purpose_commit_hash").length===0&&tags("description").length===1&&invoice.tagsObject.description===description;
    // A reviewed cross-origin provider may upgrade from its documented legacy
    // description tag to the standard LNURL metadata commitment. The callback
    // origin is still pinned before these terms are constructed, so accepting
    // the stronger standard form does not widen the provider boundary.
    const standard=tags("purpose_commit_hash").length===1&&tags("description").length===0&&invoice.tagsObject.purpose_commit_hash===commitment;
    const maximumLifetime=providerCompatible?2_678_400:86_400;
    if(!invoice.complete||invoice.network?.bech32!==terms.network||invoice.millisatoshis!==terms.amountMsat||
      typeof hash!=="string"||!/^[0-9a-f]{64}$/.test(hash)||tags("payment_hash").length!==1||
      (!standard&&!providerCompatible)||tags("expire_time").length>1||!Number.isSafeInteger(invoice.timestamp)||
      invoice.timestamp!>now+60||!Number.isSafeInteger(invoice.timeExpireDate)||
      invoice.timeExpireDate!<=invoice.timestamp!||invoice.timeExpireDate!-invoice.timestamp!>maximumLifetime||
      (!allowExpired&&invoice.timeExpireDate!<=now+30))throw new Error();
    return {paymentRequest:request,paymentHash:hash,amountMsat:terms.amountMsat,expiresAt:invoice.timeExpireDate!,terms};
  }catch{throw new Error("Outgoing invoice failed validation");}
}
