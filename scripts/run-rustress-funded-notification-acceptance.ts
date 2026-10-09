import {createHash,randomUUID} from "node:crypto";
import {lstat,open,readFile} from "node:fs/promises";
import {decode} from "bolt11";
import {z} from "zod";
import {PrivateNwcFundedAcceptance} from "../src/rustress/nwc-transport";

const pending=z.object({type:z.literal("incoming"),state:z.literal("pending"),invoice:z.string().min(20).max(4096),payment_hash:z.string().regex(/^[0-9a-f]{64}$/),amount:z.literal(100000),description:z.string()}).passthrough();
const settled=z.object({type:z.literal("incoming"),state:z.literal("settled"),invoice:z.string().min(20).max(4096),payment_hash:z.string().regex(/^[0-9a-f]{64}$/),amount:z.literal(100000),preimage:z.string().regex(/^[0-9a-f]{64}$/)}).passthrough();
const notice=z.object({type:z.literal("incoming"),payment_hash:z.string().regex(/^[0-9a-f]{64}$/),amount:z.literal(100000),preimage:z.string().regex(/^[0-9a-f]{64}$/),notification_kind:z.union([z.literal(23196),z.literal(23197)])}).passthrough();

async function main(){
 if(process.argv.length!==4||!process.getuid||process.getuid()!==0)throw new Error();
 const map=(await readFile("/proc/self/uid_map","utf8")).trim().split(/\s+/).map(Number);
 if(map.length<3||map[0]!==0||map[1]===0||map[2]!==1)throw new Error();
 const [credentialPath,invoicePath]=process.argv.slice(2),credentialStat=await lstat(credentialPath),invoiceStat=await lstat(invoicePath);
 if(!credentialStat.isFile()||credentialStat.isSymbolicLink()||(credentialStat.mode&0o777)!==0o600||credentialStat.uid!==0||credentialStat.size<80||credentialStat.size>8193||!invoiceStat.isFile()||invoiceStat.isSymbolicLink()||(invoiceStat.mode&0o777)!==0o600||invoiceStat.uid!==0||invoiceStat.size!==0)throw new Error();
 const credential=(await readFile(credentialPath,"utf8")).trim(),invoiceFile=await open(invoicePath,"w");
 const setgroups=process.setgroups,setgid=process.setgid,setuid=process.setuid,getuid=process.getuid;
 if(!setgroups||!setgid||!setuid||!getuid)throw new Error();setgroups([]);setgid(1004);setuid(1004);if(getuid()!==1004)throw new Error();
 const description=`BitcoinWalk Rustress funded notification acceptance ${randomUUID()}`;
 let created:ReturnType<typeof pending.parse>|undefined;
 const result=await new PrivateNwcFundedAcceptance(credential).run(description,async value=>{
  created=pending.parse(value);const decoded=decode(created.invoice),tag=decoded.tags.find(item=>item.tagName==="payment_hash");
  if(created.description!==description||decoded.millisatoshis!=="100000"||tag?.data!==created.payment_hash)throw new Error();
  await invoiceFile.writeFile(created.invoice+"\n");await invoiceFile.sync();await invoiceFile.close();process.stdout.write("RUSTRESS_FUNDED_INVOICE_READY\n");
 });
 if(!created)throw new Error();const received=notice.parse(result.received),lookedUp=settled.parse(result.lookedUp);
 const preimageHash=createHash("sha256").update(Buffer.from(received.preimage,"hex")).digest("hex");
 if(received.payment_hash!==created.payment_hash||lookedUp.payment_hash!==created.payment_hash||received.preimage!==lookedUp.preimage||preimageHash!==created.payment_hash||lookedUp.invoice!==created.invoice)throw new Error();
 process.stdout.write(JSON.stringify({state:"verified",amountSats:100,invoiceSettled:true,exactLookup:true,paymentReceivedNotification:true,notificationKind:received.notification_kind,outgoingPaymentSentByRustress:false})+"\n");
}
main().catch(()=>{process.stderr.write("Rustress funded notification acceptance could not be verified.\n");process.exitCode=1;});
