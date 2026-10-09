import {readFile,lstat} from "node:fs/promises";
import {z} from "zod";
import {PrivateNwcReadProbe} from "../src/rustress/nwc-transport";

const infoSchema=z.object({
 network:z.enum(["mainnet","testnet","signet","regtest"]),
 methods:z.array(z.string().min(1).max(64)).max(32),
}).passthrough();
const historySchema=z.object({transactions:z.array(z.unknown()).max(1)}).passthrough();

async function main(){
 if(process.argv.length!==3||!process.getuid||process.getuid()===0)throw new Error();
 const path=process.argv[2],stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid()||stat.size<80||stat.size>8193)throw new Error();
 const credential=(await readFile(path,"utf8")).trim();
 const probe=new PrivateNwcReadProbe("bitcoinwalk-rustress",credential);
 const info=infoSchema.parse(await probe.getInfo());
 const history=historySchema.parse(await probe.listTransactions(0,1));
 const required=["get_info","make_invoice","lookup_invoice","list_transactions","pay_invoice"];
 if(!required.every(method=>info.methods.includes(method)))throw new Error();
 process.stdout.write(JSON.stringify({
  state:"verified",binding:probe.binding,network:info.network,
  advertisedMethods:info.methods.filter(method=>required.includes(method)).sort(),
  successfulReadMethods:["get_info","list_transactions"],historyReadable:Array.isArray(history.transactions),
  invoiceCreated:false,paymentSent:false,
 })+"\n");
}
main().catch(()=>{process.stderr.write("Rustress wallet read probe could not be verified.\n");process.exitCode=1;});
