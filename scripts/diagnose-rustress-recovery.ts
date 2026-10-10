import {readFileSync,lstatSync} from "node:fs";
import {z} from "zod";
import {RustressNwcReader} from "../src/rustress/nwc-reader";

const transaction=z.object({type:z.literal("outgoing"),payment_hash:z.string().regex(/^[0-9a-f]{64}$/),
 state:z.enum(["pending","accepted","settled","expired","failed"]),amount:z.number().int().safe().positive(),
 created_at:z.number().int().safe().nonnegative(),settled_at:z.number().int().safe().nonnegative().optional(),
 fees_paid:z.number().int().safe().nonnegative().optional()});
function protectedRead(path:string,max:number){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==0||s.size<1||s.size>max)throw new Error();return readFileSync(path,"utf8").trim();}
async function main(){
 const credential=protectedRead("/run/bitcoinwalk-secrets/nwc-uri",8192),checkout=protectedRead("/run/bitcoinwalk-config/checkout-client-pubkey",65),
  host=JSON.parse(protectedRead("/run/bitcoinwalk-config/host-evidence.json",4096));
 const reader=new RustressNwcReader("bitcoinwalk-rustress",credential,{clientPubkey:checkout});
 if(reader.binding!==host.binding)throw new Error();
 const first=await reader.listRecoveryTransactions(0,50),second=await reader.listRecoveryTransactions(0,50),rows=Array.isArray(first.transactions)?first.transactions:[],parsed=rows.map(row=>transaction.safeParse(row));
 const valid=parsed.filter(row=>row.success).map(row=>row.data),hashes=valid.map(row=>row.payment_hash).sort(),secondRows=Array.isArray(second.transactions)?second.transactions:[],secondHashes=secondRows.map(row=>transaction.safeParse(row)).filter(row=>row.success).map(row=>row.data.payment_hash).sort();
 const accepted=Array.isArray(host.acceptedPriorSpends)?host.acceptedPriorSpends:[],acceptedChecks:("missing"|"matched"|"mismatched")[]=accepted.map((spend:Record<string,unknown>)=>{
  const row=valid.find(value=>value.payment_hash===spend.paymentHash);
  return !row?"missing":row.state==="settled"&&String(row.amount)===spend.amountMsat&&String(row.fees_paid??-1)===spend.feeMsat&&row.created_at===spend.createdAt&&row.settled_at===spend.settledAt?"matched":"mismatched";
 });
 process.stdout.write(JSON.stringify({totalCount:Number.isSafeInteger(first.total_count)?first.total_count:null,pageCount:rows.length,validCount:valid.length,
  invalidCount:parsed.filter(row=>!row.success).length,beforeConnection:valid.filter(row=>row.created_at<host.connectionStartedAt).length,
  atOrAfterConnection:valid.filter(row=>row.created_at>=host.connectionStartedAt).length,settled:valid.filter(row=>row.state==="settled").length,
  stable:JSON.stringify(hashes)===JSON.stringify(secondHashes),duplicateHashes:new Set(hashes).size!==hashes.length,acceptedCount:accepted.length,
  acceptedMatched:acceptedChecks.filter(value=>value==="matched").length,acceptedMissing:acceptedChecks.filter(value=>value==="missing").length,
  acceptedMismatched:acceptedChecks.filter(value=>value==="mismatched").length})+"\n");
}
main().catch(()=>{process.stderr.write("Rustress recovery diagnostic could not be verified.\n");process.exitCode=1;});
