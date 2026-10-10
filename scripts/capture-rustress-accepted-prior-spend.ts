import {lstatSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {z} from "zod";
import {RustressNwcReader} from "../src/rustress/nwc-reader";

const rowSchema=z.object({type:z.literal("outgoing"),payment_hash:z.string().regex(/^[0-9a-f]{64}$/),state:z.literal("settled"),
 amount:z.literal(79000),created_at:z.number().int().safe().positive(),settled_at:z.number().int().safe().positive(),fees_paid:z.literal(1786)});
function protectedRead(path:string,max:number){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==0||s.size<1||s.size>max)throw new Error();return readFileSync(path,"utf8").trim();}
async function history(reader:RustressNwcReader){
 const rows:unknown[]=[];let expected:number|undefined;
 for(let offset=0;offset<=10000;offset+=50){const page=await reader.listRecoveryTransactions(offset,50);
  if(!Number.isSafeInteger(page.total_count)||Number(page.total_count)<0||Number(page.total_count)>10000||!Array.isArray(page.transactions)||page.transactions.length>50)throw new Error();
  if(expected!==undefined&&expected!==page.total_count)throw new Error();expected=Number(page.total_count);rows.push(...page.transactions);
  if(rows.length===expected)return rows;if(page.transactions.length!==50)throw new Error();}
 throw new Error();
}
async function main(){
 const output="/var/lib/bitcoinwalk-payout/accepted-prior-spends.json",credential=protectedRead("/run/bitcoinwalk-secrets/nwc-uri",8192),
  checkout=protectedRead("/run/bitcoinwalk-config/checkout-client-pubkey",65),host=JSON.parse(protectedRead("/run/bitcoinwalk-config/host-evidence.json",8192));
 const reader=new RustressNwcReader("bitcoinwalk-rustress",credential,{clientPubkey:checkout});if(reader.binding!==host.binding)throw new Error();
 const first=await history(reader),second=await history(reader);if(JSON.stringify(first)!==JSON.stringify(second))throw new Error();
 const candidates=first.filter(value=>{const parsed=rowSchema.safeParse(value);return parsed.success&&parsed.data.created_at>=host.connectionStartedAt;});
 if(candidates.length!==1||first.length!==1)throw new Error();const row=rowSchema.parse(candidates[0]),proof=await reader.lookupPayout(row.payment_hash);
 if(proof.state!=="paid"||proof.paymentHash!==row.payment_hash||proof.amountMsat!==String(row.amount)||proof.feeMsat!==String(row.fees_paid))throw new Error();
 const document=JSON.stringify([{paymentHash:row.payment_hash,amountMsat:String(row.amount),feeMsat:String(row.fees_paid),createdAt:row.created_at,settledAt:row.settled_at}])+"\n";
 try{const existing=protectedRead(output,8192);if(existing!==document.trim())throw new Error();}
 catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;const temporary=output+".tmp";writeFileSync(temporary,document,{mode:0o600,flag:"wx"});renameSync(temporary,output);}
 process.stdout.write("ACCEPTED_PRIOR_SPEND_RECORDED count=1 principalSats=79 feeMsat=1786\n");
}
main().catch(()=>{process.stderr.write("Accepted prior spend capture failed closed.\n");process.exitCode=1;});
