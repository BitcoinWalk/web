import {lstat,readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {decode} from "bolt11";
import {z} from "zod";
import {PrivateNwcUnpaidAcceptance} from "../src/rustress/nwc-transport";

const transaction=z.object({type:z.literal("incoming"),state:z.literal("pending"),invoice:z.string().min(20).max(4096),payment_hash:z.string().regex(/^[0-9a-f]{64}$/),amount:z.number().int().positive(),description:z.string()}).passthrough();

async function main(){
 if(process.argv.length!==3||!process.getuid||process.getuid()!==0)throw new Error();
 const map=(await readFile("/proc/self/uid_map","utf8")).trim().split(/\s+/).map(Number);
 if(map.length<3||map[0]!==0||map[1]===0||map[2]!==1)throw new Error();
 const path=process.argv[2],stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||stat.uid!==0||stat.size<80||stat.size>8193)throw new Error();
 const credential=(await readFile(path,"utf8")).trim();
 const setgroups=process.setgroups,setgid=process.setgid,setuid=process.setuid,getuid=process.getuid;
 if(!setgroups||!setgid||!setuid||!getuid)throw new Error();setgroups([]);setgid(1004);setuid(1004);if(getuid()!==1004)throw new Error();
 const description=`BitcoinWalk Rustress unpaid acceptance ${randomUUID()}`;
 const result=await new PrivateNwcUnpaidAcceptance(credential).run(description);
 const created=transaction.parse(result.created),lookedUp=transaction.parse(result.lookedUp);
 const decoded=decode(created.invoice),hashTag=decoded.tags.find(tag=>tag.tagName==="payment_hash");
 if(created.amount!==1000||lookedUp.amount!==1000||created.payment_hash!==lookedUp.payment_hash||created.invoice!==lookedUp.invoice||created.description!==description||lookedUp.description!==description||hashTag?.data!==created.payment_hash||decoded.millisatoshis!=="1000")throw new Error();
 process.stdout.write(JSON.stringify({state:"verified",amountMsat:1000,invoiceCreated:true,invoiceExpiresUnpaid:true,exactLookup:true,lookupState:"pending",notificationCapability:result.notificationCapability,notificationSubscriptionEstablished:result.notificationSubscriptionEstablished,notificationDeliveryObserved:false,paymentSent:false})+"\n");
}
main().catch(()=>{process.stderr.write("Rustress unpaid invoice acceptance could not be verified.\n");process.exitCode=1;});
