import {createHash} from "node:crypto";
import type {PayoutWallet} from "./payout-worker";

/** Read-only boundary for a future authenticated, connection-bound NWC adapter.
 * Transport must verify response signer/request binding before returning data.
 * No generic RPC, pay method, credentials or runtime wiring here. */
export function createPayoutLookup(walletRef:string,read:(hash:string)=>Promise<unknown>):PayoutWallet["lookup"]{
 return async hash=>{
  try{
   if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(walletRef)||!/^[0-9a-f]{64}$/.test(hash))throw new Error();
   const result=await read(hash) as Record<string,unknown>;
   if(!result||result.type!=="outgoing"||result.payment_hash!==hash)throw new Error();
   if(result.state!=="settled")return {state:"pending"};
   if(!Number.isSafeInteger(result.amount)||Number(result.amount)<=0||!Number.isSafeInteger(result.fees_paid)||Number(result.fees_paid)<0||
    !Number.isSafeInteger(result.settled_at)||Number(result.settled_at)<=0||typeof result.preimage!=="string"||!/^[0-9a-f]{64}$/.test(result.preimage)||
    createHash("sha256").update(Buffer.from(result.preimage,"hex")).digest("hex")!==hash)throw new Error();
   return {state:"paid",walletRef,paymentHash:hash,amountMsat:String(result.amount),feeMsat:String(result.fees_paid),preimage:result.preimage};
  }catch{throw new Error("Payout lookup could not be verified");}
 };
}
