import {z} from "zod";
import type {RustressNwcReader} from "./nwc-reader";

const stamp=z.number().int().safe().nonnegative();
const money=z.string().regex(/^(0|[1-9][0-9]{0,15})$/);
const acceptedSpendSchema=z.object({paymentHash:z.string().regex(/^[0-9a-f]{64}$/),amountMsat:money.refine(v=>BigInt(v)>0n),
 feeMsat:money,createdAt:stamp,settledAt:stamp}).strict();
const coverageSchema=z.object({binding:z.string().regex(/^[0-9a-f]{64}$/),fenceId:z.string().uuid(),
 connectionStartedAt:stamp,retainedFrom:stamp,checkedAt:stamp,expiresAt:stamp,
 exclusive:z.literal(true),sendersStopped:z.literal(true),acceptedPriorSpends:z.array(acceptedSpendSchema).max(16)}).strict();
export type RecoveryCoverage=z.infer<typeof coverageSchema>;
const transactionSchema=z.object({type:z.literal("outgoing"),payment_hash:z.string().regex(/^[0-9a-f]{64}$/),
 state:z.enum(["pending","accepted","settled","expired","failed"]),amount:z.number().int().safe().positive(),
 created_at:stamp,settled_at:stamp.optional(),fees_paid:z.number().int().safe().nonnegative().optional()});
type Reader=Pick<RustressNwcReader,"binding"|"listRecoveryTransactions">;

/** Hub-v1.24 history collector. NWC pagination alone cannot prove retention or
 * exclusive ownership. Coverage must come from separately audited server-side
 * inventory and sender fencing, NEVER a browser assertion or get_info result. */
export function createRecoveryHistory(reader:Reader,coverage:()=>Promise<RecoveryCoverage>,now=()=>Math.floor(Date.now()/1000)){
 return async()=>{
  const blocked=()=>({binding:reader.binding,complete:false,outgoingHashes:[] as string[]});
  try{
   const check=async()=>{
    const c=coverageSchema.parse(await coverage()),time=now();
    if(c.binding!==reader.binding||c.retainedFrom>c.connectionStartedAt||c.connectionStartedAt>time||c.checkedAt>time||time-c.checkedAt>60||c.expiresAt<=time)throw new Error();
    return c;
   };
   const before=await check();
   const scan=async()=>{
    const rows:z.infer<typeof transactionSchema>[]=[];let expected:number|undefined;
    // Hard bounds prevent an endless wallet response from monopolizing recovery.
    for(let offset=0;offset<=10000;offset+=50){
     if(now()>=before.expiresAt||now()-before.checkedAt>60)throw new Error();
     const page=await reader.listRecoveryTransactions(offset,50);
     if(!Number.isSafeInteger(page.total_count)||Number(page.total_count)<0||Number(page.total_count)>10000||!Array.isArray(page.transactions)||page.transactions.length>50)throw new Error();
     if(expected!==undefined&&expected!==page.total_count)throw new Error();expected=Number(page.total_count);
     const parsed=page.transactions.map(row=>transactionSchema.parse(row));
     if(parsed.some(row=>row.created_at<before.connectionStartedAt||row.created_at>now()+60))throw new Error();
     rows.push(...parsed);
     if(rows.length>expected||new Set(rows.map(row=>row.payment_hash)).size!==rows.length)throw new Error();
     if(rows.length===expected)return rows.sort((a,b)=>a.payment_hash.localeCompare(b.payment_hash));
     if(parsed.length!==50)throw new Error();
    }
    throw new Error();
   };
   const first=await scan(),second=await scan(),after=await check();
   if(before.fenceId!==after.fenceId||before.connectionStartedAt!==after.connectionStartedAt||before.retainedFrom!==after.retainedFrom||JSON.stringify(first)!==JSON.stringify(second))throw new Error();
   const accepted=new Map(before.acceptedPriorSpends.map(row=>[row.paymentHash,row]));
   if(accepted.size!==before.acceptedPriorSpends.length||JSON.stringify(before.acceptedPriorSpends)!==JSON.stringify(after.acceptedPriorSpends))throw new Error();
   for(const spend of accepted.values()){
    const row=first.find(value=>value.payment_hash===spend.paymentHash);
    if(!row||row.state!=="settled"||String(row.amount)!==spend.amountMsat||String(row.fees_paid??-1)!==spend.feeMsat||
     row.created_at!==spend.createdAt||row.settled_at!==spend.settledAt)throw new Error();
   }
   return {binding:reader.binding,complete:true,outgoingHashes:first.filter(row=>!accepted.has(row.payment_hash)).map(row=>row.payment_hash),
    acceptedPriorSpentMsat:String(before.acceptedPriorSpends.reduce((sum,row)=>sum+BigInt(row.amountMsat)+BigInt(row.feeMsat),0n))};
  }catch{return blocked();}
 };
}
