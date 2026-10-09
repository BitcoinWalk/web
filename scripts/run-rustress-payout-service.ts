import {createServer} from "node:http";
import {chmodSync,lstatSync,readFileSync,realpathSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {backup,DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {PayoutLedger} from "../src/rustress/payout-ledger";
import {PayoutAuthorityStore} from "../src/rustress/payout-authority";
import {PayoutInvoiceIntake} from "../src/rustress/payout-intake";
import {PayoutControlApi} from "../src/rustress/payout-control-api";
import {PayoutInvoiceIssuer} from "../src/rustress/payout-invoice-issuer";
import {PayoutHostEvidence} from "../src/rustress/payout-host-evidence";
import {verifyPayoutActivation} from "../src/rustress/payout-activation";
import {PayoutRuntime} from "../src/rustress/payout-runtime";
import {PayoutAutomation} from "../src/rustress/payout-automation";
import {PayoutServiceController} from "../src/rustress/payout-service-controller";
import {RemoteJournalClient} from "../src/rustress/remote-journal-client";
import {recipientJson} from "../src/rustress/recipient-invoice";
import {PrivateNwcTransport} from "../src/rustress/nwc-transport";
import {receiptEvidenceSocketHandler} from "../src/rustress/receipt-evidence-socket";

const version="0.2.5",admin="90cf043861e5b5a9972cb7b529a5ba71b215d6d1e314c749d5526ec133f1db73",walletRef="bitcoinwalk-rustress";
const configRoot="/run/bitcoinwalk-config",secretRoot="/run/bitcoinwalk-secrets",stateRoot="/var/lib/bitcoinwalk-payout";
const evidenceSocket="/run/bitcoinwalk-payout-evidence/socket/evidence.sock";
const tokenPattern=/^[A-Za-z0-9_-]{43,256}$/;

function protectedPath(path:string,type:"file"|"directory",mode:number){
 const stat=lstatSync(path);
 if(stat.isSymbolicLink()||(type==="file"?!stat.isFile():!stat.isDirectory())||(stat.mode&0o777)!==mode||stat.uid!==0||realpathSync(path)!==path||type==="file"&&stat.nlink!==1)throw new Error();
 return stat;
}
function read(path:string,pattern?:RegExp,max=65536){
 const stat=protectedPath(path,"file",0o600);if(stat.size<1||stat.size>max)throw new Error();const value=readFileSync(path,"utf8").trim();if(pattern&&!pattern.test(value))throw new Error();return value;
}
function json(path:string){return JSON.parse(read(path,undefined,65536));}
function atomicStatus(value:unknown){const target=join(stateRoot,"health.json"),temporary=join(stateRoot,".health.json.tmp");writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,target);}
async function snapshot(source:DatabaseSync){
 const target=join(stateRoot,"managed-backup.sqlite"),temporary=join(stateRoot,".managed-backup.sqlite.tmp");rmSync(temporary,{force:true});
 await backup(source,temporary);const checked=new DatabaseSync(temporary,{readOnly:true});try{if(Object.values(checked.prepare("PRAGMA integrity_check").get()!)[0]!=="ok")throw new Error();}finally{checked.close();}
 renameSync(temporary,target);
}
function rootless(){const map=readFileSync("/proc/self/uid_map","utf8").trim().split(/\s+/).map(Number);return process.getuid?.()===0&&map.length>=3&&map[0]===0&&map[1]!==0&&map[2]===1;}
async function body(request:import("node:http").IncomingMessage){
 const chunks:Buffer[]=[];let size=0;for await(const chunk of request){const value=Buffer.from(chunk);size+=value.length;if(size>16384)throw new Error();chunks.push(value);}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):undefined;
}
async function main(){
 if(!rootless())throw new Error();process.umask(0o077);protectedPath(stateRoot,"directory",0o700);
 const mode=read(join(configRoot,"payout-mode"),/^(disabled|armed)$/);
 if(mode==="disabled"){
 protectedPath(join(secretRoot,"nwc-uri"),"file",0o600); // existence only; never read
  const source=new DatabaseSync(join(stateRoot,"ledger.sqlite"),{readOnly:true});try{await snapshot(source);}finally{source.close();}
  const status=Object.freeze({service:"bitcoinwalk-rustress-payout",version,mode:"disabled",payoutsEnabled:false,invoiceIssuanceEnabled:false,credentialLoaded:false,automationRunning:false,networkAccess:false});
  const server=createServer((request,response)=>{const ok=request.method==="GET"&&(request.url==="/health"||request.url==="/v1/status");response.writeHead(ok?200:404,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify(ok?status:{error:"not-found"}));});
  server.listen(8893,"127.0.0.1");const timer=setInterval(()=>{const db=new DatabaseSync(join(stateRoot,"ledger.sqlite"),{readOnly:true});void snapshot(db).catch(()=>{process.stderr.write("Managed payout snapshot failed.\n");}).finally(()=>db.close());},21600000);timer.unref?.();let stopping=false;const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);server.close(()=>process.exit(0));};process.on("SIGTERM",stop);process.on("SIGINT",stop);return;
 }
 let db:DatabaseSync|undefined,server:ReturnType<typeof createServer>|undefined,evidenceServer:ReturnType<typeof createServer>|undefined,controller:PayoutServiceController|undefined;
 try{
  const pin=z.object({serviceId:z.uuid(),binding:z.string().regex(/^[0-9a-f]{64}$/)}).strict().parse(json(join(configRoot,"journal-pin.json")));
  const nwc=read(join(secretRoot,"nwc-uri"),/^nostr\+walletconnect:\/\//,8192),checkout={clientPubkey:read(join(configRoot,"checkout-client-pubkey"),/^[0-9a-f]{64}$/)};
  const journalToken=read(join(secretRoot,"journal-client-token"),tokenPattern),tokens={intake:read(join(secretRoot,"intake-api-token"),tokenPattern),issuer:read(join(secretRoot,"issuer-api-token"),tokenPattern),receipt:read(join(secretRoot,"receipt-api-token"),tokenPattern),authority:read(join(secretRoot,"authority-api-token"),tokenPattern),operations:read(join(secretRoot,"operations-api-token"),tokenPattern)};
  db=new DatabaseSync(join(stateRoot,"ledger.sqlite"));db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
  const ledger=new PayoutLedger(db),authority=new PayoutAuthorityStore(db),journal=new RemoteJournalClient("http://127.0.0.1:18894",journalToken,pin.serviceId,pin.binding);
  let enabled=()=>false;
  const host=new PayoutHostEvidence(json(join(configRoot,"host-evidence.json")),ledger,()=>journal.status(),()=>enabled());
  const policy=host.policy(),activation=json(join(configRoot,"activation.json")),expected={admin,release:version,binding:pin.binding,journalServiceId:pin.serviceId,
   budgetMsat:policy.budgetMsat,maximumPayoutMsat:policy.maximumPayoutMsat,maximumFeeMsat:policy.maximumFeeMsat};
  enabled=()=>{try{verifyPayoutActivation(activation,expected);return true;}catch{return false;}};
  if(!enabled())throw new Error();
  if(process.env.PAYOUT_PREFLIGHT==="1"){db.close();db=undefined;process.stdout.write("RUSTRESS_PAYOUT_PREFLIGHT_OK\n");return;}
  const runtime=new PayoutRuntime({ledger,walletRef,network:"bc",policy,journal:{origin:"http://127.0.0.1:18894",serviceId:pin.serviceId},
   credentials:async()=>({wallet:nwc,checkout,journalClientToken:journalToken}),evidence:async()=>host.evidence(),deployment:()=>host.deployment(),coverage:()=>host.coverage(),permit:r=>host.permit(r),fetchJson:recipientJson,hubSafety:async()=>host.hubSafety()},enabled);
  const automation=new PayoutAutomation(runtime,ledger,walletRef,enabled,15000),holder={current:undefined as PayoutServiceController|undefined};
  controller=new PayoutServiceController(automation,()=>runtime.ready,enabled,undefined,15000,status=>atomicStatus({service:"bitcoinwalk-rustress-payout",version,...status,...ledger.operationalStatus(walletRef)}));holder.current=controller;
  const intake=new PayoutInvoiceIntake(ledger,(city,revision)=>Promise.resolve(authority.resolve(city,revision))),invoiceTransport=new PrivateNwcTransport(walletRef,nwc,checkout);
  if(invoiceTransport.binding!==pin.binding)throw new Error();
  const issuer=new PayoutInvoiceIssuer(db,intake,(city,revision)=>Promise.resolve(authority.resolveInvoice(city,revision)),{makeInvoice:input=>invoiceTransport.call("make_invoice",{amount:Number(input.amountMsat),description_hash:input.descriptionHash,expiry:input.expirySeconds})},hash=>ledger.incomingStatus(walletRef,hash),undefined,hash=>invoiceTransport.lookupInvoice(hash));
  const api=new PayoutControlApi(authority,intake,ledger,walletRef,enabled,()=>holder.current!.status(),tokens,issuer);
  protectedPath(dirname(evidenceSocket),"directory",0o700);try{const stat=lstatSync(evidenceSocket);if(!stat.isSocket()||stat.isSymbolicLink())throw new Error();rmSync(evidenceSocket);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  evidenceServer=createServer(receiptEvidenceSocketHandler(api));evidenceServer.requestTimeout=10000;evidenceServer.headersTimeout=5000;evidenceServer.maxRequestsPerSocket=4;
  server=createServer((request,response)=>{void (async()=>{let result;try{result=await api.route(request.method,request.url,request.headers.authorization,request.method==="POST"?await body(request):undefined);}catch{result={status:400,body:{error:"request-rejected"}};}response.writeHead(result.status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify(result.body));})();});
  await snapshot(db);const snapshotTimer=setInterval(()=>{if(db)void snapshot(db).catch(()=>{controller?.stop();process.stderr.write("Managed payout snapshot failed.\n");});},21600000);snapshotTimer.unref?.();
  await new Promise<void>((resolve,reject)=>{evidenceServer!.once("error",reject);evidenceServer!.listen(evidenceSocket,()=>{chmodSync(evidenceSocket,0o600);resolve();});});
  await new Promise<void>((resolve,reject)=>{server!.once("error",reject);server!.listen(8893,"127.0.0.1",resolve);});controller.start();atomicStatus({service:"bitcoinwalk-rustress-payout",version,...controller.status(),...ledger.operationalStatus(walletRef)});
  let stopping=false;const stop=()=>{if(stopping)return;stopping=true;clearInterval(snapshotTimer);controller!.stop();server!.close(()=>evidenceServer!.close(()=>{rmSync(evidenceSocket,{force:true});db!.close();process.exit(0);}));};process.on("SIGTERM",stop);process.on("SIGINT",stop);
 }catch(error){controller?.stop();server?.close();evidenceServer?.close();rmSync(evidenceSocket,{force:true});db?.close();throw error;}
}
main().catch(()=>{process.stderr.write("Rustress payout service refused to start.\n");process.exitCode=1;});
