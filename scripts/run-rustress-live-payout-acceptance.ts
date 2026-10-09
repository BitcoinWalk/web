import {randomBytes} from "node:crypto";
import {lstat,open,readFile} from "node:fs/promises";
import {nip47} from "nostr-tools";
import {z} from "zod";
import {retrieveRecipientInvoice} from "../src/rustress/recipient-invoice";
import {validateOutgoingInvoice} from "../src/rustress/outgoing-invoice";
import {RustressNwcWallet} from "../src/rustress/nwc-wallet";

const destination="liberatelife@getalby.com",amountMsat="79000",maximumFeeMsat="10000",walletRef="bitcoinwalk-rustress";
const stateSchema=z.object({version:z.literal(1),destination:z.literal(destination),amountMsat:z.literal(amountMsat),maximumFeeMsat:z.literal(maximumFeeMsat),binding:z.string().regex(/^[0-9a-f]{64}$/),paymentHash:z.string().regex(/^[0-9a-f]{64}$/),invoice:z.string().min(20).max(16384),expiresAt:z.number().int().positive(),terms:z.object({amountMsat:z.literal(amountMsat),minMsat:z.string(),maxMsat:z.string(),network:z.literal("bc"),metadata:z.string()}).strict()}).strict();
const claimSchema=z.object({version:z.literal(1),binding:z.string().regex(/^[0-9a-f]{64}$/),paymentHash:z.string().regex(/^[0-9a-f]{64}$/),claimedAt:z.number().int().positive()}).strict();
let stage="startup";

async function privateFile(path:string,empty?:boolean){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||stat.uid!==0||empty!==undefined&&(stat.size===0)!==empty)throw new Error();return stat;}
function separateCheckout(value:string){const parsed=nip47.parseConnectionString(value),url=new URL(`nostr+walletconnect://${parsed.pubkey}`);for(const relay of parsed.relays)url.searchParams.append("relay",relay);url.searchParams.set("secret",randomBytes(32).toString("hex"));return url.toString();}
function dropPrivileges(){if(!process.setgroups||!process.setgid||!process.setuid||!process.getuid)throw new Error();process.setgroups([]);process.setgid(1004);process.setuid(1004);if(process.getuid()!==1004)throw new Error();}
async function lookupPaid(wallet:RustressNwcWallet,hash:string){for(let attempt=0;attempt<8;attempt++){const result=await wallet.lookup(hash);if(result.state==="paid")return result;await new Promise(resolve=>setTimeout(resolve,1500));}throw new Error();}

async function main(){
 stage="arguments";
 const [mode,credentialPath,statePath,claimPath]=process.argv.slice(2);
 if(!["prepare","send","recover"].includes(mode)||!process.getuid||process.getuid()!==0||!credentialPath||!statePath||!claimPath)throw new Error();
 const map=(await readFile("/proc/self/uid_map","utf8")).trim().split(/\s+/).map(Number);if(map.length<3||map[0]!==0||map[1]===0||map[2]!==1)throw new Error();
 stage="private-files";await privateFile(credentialPath);await privateFile(statePath,mode==="prepare");await privateFile(claimPath,mode!=="recover");
 stage="wallet-binding";
 const credential=(await readFile(credentialPath,"utf8")).trim(),checkout=separateCheckout(credential);
 let enabled=false,expectedHash="",expectedBinding="";
 const wallet=new RustressNwcWallet(walletRef,credential,checkout,"bc",async request=>{
  if(!enabled||request.binding!==expectedBinding||request.paymentHash!==expectedHash||request.amountMsat!==amountMsat||request.maximumFeeMsat!==maximumFeeMsat)throw new Error();
  const now=Math.floor(Date.now()/1000);return {binding:request.binding,paymentHash:request.paymentHash,amountMsat,enforcedFeeCeilingMsat:maximumFeeMsat,checkedAt:now,expiresAt:now+20,authorized:true};
 },()=>enabled);
 if(mode==="prepare"){
  const stateFile=await open(statePath,"w");dropPrivileges();stage="recipient-invoice";
  const outgoing=await retrieveRecipientInvoice(destination,amountMsat,"bc");
  stage="prepared-state";
  const state=stateSchema.parse({version:1,destination,amountMsat,maximumFeeMsat,binding:wallet.binding,paymentHash:outgoing.paymentHash,invoice:outgoing.paymentRequest,expiresAt:outgoing.expiresAt,terms:outgoing.terms});
  await stateFile.writeFile(JSON.stringify(state));await stateFile.sync();await stateFile.close();
  process.stdout.write(JSON.stringify({state:"prepared",destination,amountSats:79,maximumRoutingFeeSats:10,expiresAt:state.expiresAt,noPaymentSent:true})+"\n");return;
 }
 stage="stored-state-parse";const state=stateSchema.parse(JSON.parse(await readFile(statePath,"utf8")));
 stage="wallet-binding-match";if(state.binding!==wallet.binding)throw new Error();
 stage="stored-invoice-validation";const checked=validateOutgoingInvoice(state.invoice,state.terms,Math.floor(Date.now()/1000),mode==="recover");if(checked.paymentHash!==state.paymentHash||checked.amountMsat!==amountMsat)throw new Error();
 const claimFile=await open(claimPath,mode==="send"?"r+":"r");const claimText=(await claimFile.readFile("utf8")).trim();dropPrivileges();
 expectedBinding=wallet.binding;expectedHash=state.paymentHash;
 if(mode==="send"){
  stage="durable-claim";
  if(claimText)throw new Error();const claim=claimSchema.parse({version:1,binding:wallet.binding,paymentHash:state.paymentHash,claimedAt:Math.floor(Date.now()/1000)});
  await claimFile.writeFile(JSON.stringify(claim));await claimFile.sync();enabled=true;
  stage="wallet-send";try{await wallet.send({invoice:state.invoice,maximumFeeMsat,paymentHash:state.paymentHash});}catch{}finally{enabled=false;}
 }else{const claim=claimSchema.parse(JSON.parse(claimText));if(claim.binding!==wallet.binding||claim.paymentHash!==state.paymentHash)throw new Error();}
 stage="exact-lookup";await claimFile.close();const paid=await lookupPaid(wallet,state.paymentHash);
 if(paid.amountMsat!==amountMsat||BigInt(paid.feeMsat)>BigInt(maximumFeeMsat))throw new Error();
 process.stdout.write(JSON.stringify({state:"verified",destination,amountSats:79,routingFeeSats:Number(paid.feeMsat)/1000,exactLookup:true,preimageVerified:true,sendAttempted:mode==="send",recoveryNoResend:mode==="recover"})+"\n");
}
main().catch(()=>{process.stderr.write(`Rustress live payout acceptance stopped at ${stage}. Sending remains disabled.\n`);process.exitCode=1;});
