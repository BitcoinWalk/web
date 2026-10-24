import {lstatSync,readFileSync,realpathSync,mkdirSync,rmdirSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {join,dirname,isAbsolute} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {SponsorPayoutStore} from "../src/payments/sponsor-payout-sender";
import {sponsorPayoutOrderScopeSchema,SPONSOR_PAYOUT_OPERATION_CONTRACT} from "../src/payments/sponsor-payout-operation";
import {SponsorPayoutRuntime,sponsorPayoutConnections} from "../src/payments/sponsor-payout-runtime";
import {requireSponsorPayoutOrder} from "../src/payments/sponsor-payout-order";
import type {SponsorWalletReadinessEvidence} from "../src/payments/sponsor-wallet-readiness";
import type {RecoveryCoverage} from "../src/rustress/recovery-history";

const release="0.1.3",admin="90cf043861e5b5a9972cb7b529a5ba71b215d6d1e314c749d5526ec133f1db73";
const hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/);
const configSchema=z.object({environment:z.enum(["staging","production"]),database:z.string().min(1),binding:hex,walletRef:z.literal("bitcoinwalk-sponsor-payout"),
 journalServiceId:z.uuid(),journalOrigin:z.string().url(),budgetMsat:money,maximumPayoutMsat:money,maximumFeeMsat:money,cityIds:z.array(z.uuid()).length(1),
 order:sponsorPayoutOrderScopeSchema,checkoutClientPubkey:hex,zapClientPubkey:hex}).strict();
const canonicalDatabases={staging:"/var/lib/bitcoinwalk-app-staging/payments.sqlite",production:"/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite"} as const;

function protectedPath(path:string,directory=false){
 const stat=lstatSync(path);
 if(!isAbsolute(path)||stat.isSymbolicLink()||realpathSync(path)!==path||stat.uid!==process.getuid?.()||
  (directory?!stat.isDirectory():!stat.isFile())||(stat.mode&0o777)!==(directory?0o700:0o600)||!directory&&stat.nlink!==1)throw new Error();
 return stat;
}
function read(path:string,max=65536){const stat=protectedPath(path);if(stat.size<1||stat.size>max)throw new Error();return readFileSync(path,"utf8").trim();}

async function main(){
 const [command,root,...extra]=process.argv.slice(2);
 if(extra.length||!["--review","--preflight","--send"].includes(command)||!root||!process.getuid)throw new Error();
 process.umask(0o077);protectedPath(root,true);
 const configText=read(join(root,"config.json")),config=configSchema.parse(JSON.parse(configText));
 if(config.database!==canonicalDatabases[config.environment])throw new Error();
 protectedPath(config.database);protectedPath(dirname(config.database),true);
 const expected={admin,release,binding:config.binding,walletRef:config.walletRef,journalServiceId:config.journalServiceId,budgetMsat:config.budgetMsat,maximumPayoutMsat:config.maximumPayoutMsat,maximumFeeMsat:config.maximumFeeMsat,cityIds:config.cityIds,order:config.order};
 if(command==="--review"){
  const source=new DatabaseSync(config.database,{readOnly:true});
  try{
   // Review never initializes the payout table or loads wallet credentials.
   const obligation=source.prepare("SELECT * FROM sponsorship_host_obligation WHERE orderId=?").get(config.order.orderId);
   if(!obligation||obligation.receivedMsat!==config.order.receivedMsat||obligation.hostPubkey!==config.order.hostPubkey||obligation.cityId!==config.cityIds[0])throw new Error();
   const received=BigInt(config.order.receivedMsat),host=received*79n/100n,fee=(host+99n)/100n>10000n?(host+99n)/100n:10000n;
   if(String(host)!==obligation.hostMsat||host>BigInt(config.maximumPayoutMsat)||fee>BigInt(config.maximumFeeMsat)||fee>received-host||host+fee>BigInt(config.budgetMsat))throw new Error();
   requireSponsorPayoutOrder(source,config.order,config.cityIds[0]);
   const now=Math.floor(Date.now()/1000),expiresAt=now+3600;
   const {admin:signer,...scope}=expected;
   const template={kind:30312,created_at:now,tags:[["d","bitcoinwalk-sponsor-payout-operation"],["expiration",String(expiresAt)]],content:JSON.stringify({contract:SPONSOR_PAYOUT_OPERATION_CONTRACT,mode:"continuous",...scope,notBefore:now,expiresAt,nonce:randomUUID()})};
   writeFileSync(join(root,"unsigned-operation.json"),JSON.stringify(template)+"\n",{mode:0o600,flag:"wx"});
   process.stdout.write(JSON.stringify({state:"review-required",signer,expiresAt,receivedMsat:String(received),hostMsat:String(host),retainedMsat:String(received-host),budgetMsat:config.budgetMsat,maximumPayoutMsat:config.maximumPayoutMsat,approvedFeeLimitMsat:config.maximumFeeMsat,calculatedFeeCeilingMsat:String(fee),paymentSent:false})+"\n");
  }finally{source.close();}return;
 }
 const mode=command==="--send"?"single-order":"preflight";
 // Exclusive local process lock. Never automatically steal a crashed sender's
 // lock: an operator must reconcile its outcome before removing it.
 const lock=join(dirname(config.database),".sponsor-payout-order.lock");mkdirSync(lock,{mode:0o700});
 let db:DatabaseSync|undefined,runtime:SponsorPayoutRuntime|undefined,stopped=false;
 const stop=()=>{stopped=true;runtime?.pause();};
 process.on("SIGTERM",stop);process.on("SIGINT",stop);
 try{
  const enabled=()=>{try{return !stopped&&read(join(root,"mode"),32)===mode&&read(join(root,"config.json"))===configText;}catch{return false;}};
  if(!enabled())throw new Error();
  db=new DatabaseSync(config.database);db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;");
  if(Object.values(db.prepare("PRAGMA integrity_check").get()!)[0]!=="ok")throw new Error();
  const store=new SponsorPayoutStore(db);
  runtime=new SponsorPayoutRuntime({store,expected,operation:()=>JSON.parse(read(join(root,"operation.json"))),
   evidence:async()=>JSON.parse(read(join(root,"wallet-evidence.json"))) as {binding:string;readiness:SponsorWalletReadinessEvidence},
   deployment:async()=>JSON.parse(read(join(root,"deployment.json"))),coverage:async()=>JSON.parse(read(join(root,"coverage.json"))) as RecoveryCoverage,
   connect:async(permit,active)=>sponsorPayoutConnections({walletRef:config.walletRef,wallet:read(join(root,"nwc-uri"),8192),checkoutClientPubkey:config.checkoutClientPubkey,zapClientPubkey:config.zapClientPubkey,
    journalOrigin:config.journalOrigin,journalToken:read(join(root,"journal-token"),256),serviceId:config.journalServiceId,binding:config.binding},permit,active),
  },enabled);
  const result=await runtime.execute(command==="--send");
  process.stdout.write(JSON.stringify({service:"bitcoinwalk-sponsor-payout-order",release,environment:config.environment,mode,...result})+"\n");
  if(result.state!=="ready"&&result.state!=="paid")process.exitCode=2;
 }finally{runtime?.pause();db?.close();process.off("SIGTERM",stop);process.off("SIGINT",stop);rmdirSync(lock);}
}
main().catch(()=>{process.stderr.write("Sponsor payout order runner refused. No outcome may be assumed; inspect the private ledger before retrying.\n");process.exitCode=1;});
