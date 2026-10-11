import {chmodSync,lstatSync,readFileSync,realpathSync,rmSync} from "node:fs";
import {createServer,type IncomingMessage} from "node:http";
import {dirname,join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {ReceiptEvidenceClient} from "../src/rustress/receipt-evidence-client";
import {ReceiptRelayEgressClient} from "../src/rustress/receipt-relay-egress";
import {ReceiptSignerSocketClient} from "../src/rustress/receipt-signer-socket";
import {ZapReceiptAuthority} from "../src/rustress/zap-receipt-authority";
import {receiptIntakeHandler} from "../src/rustress/receipt-intake-socket";

const version="0.1.3",configRoot="/run/bitcoinwalk-receipt-worker/config",secretRoot="/run/bitcoinwalk-receipt-worker/secrets",stateRoot="/var/lib/bitcoinwalk-receipt-worker",evidenceSocket="/run/bitcoinwalk-payout-evidence/socket/evidence.sock",signerSocket="/run/bitcoinwalk-receipt-signer/socket/signer.sock",egressSocket="/run/bitcoinwalk-receipt-egress/socket/relay.sock";
const tokenPattern=/^[A-Za-z0-9_-]{43,256}$/;
const intakeSocket="/run/bitcoinwalk-receipt-worker/socket/intake.sock";
function protectedPath(path:string,type:"file"|"directory",mode:number){const stat=lstatSync(path);if(stat.isSymbolicLink()||(type==="file"?!stat.isFile():!stat.isDirectory())||(stat.mode&0o777)!==mode||stat.uid!==0||realpathSync(path)!==path||type==="file"&&stat.nlink!==1)throw new Error();return stat;}
function protectedSocket(path:string){const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isSocket()||(stat.mode&0o777)!==0o600||stat.uid!==0||realpathSync(path)!==path)throw new Error();}
function read(path:string,pattern?:RegExp,max=65536){const stat=protectedPath(path,"file",0o600);if(stat.size<1||stat.size>max)throw new Error();const value=readFileSync(path,"utf8").trim();if(pattern&&!pattern.test(value))throw new Error();return value;}
function rootless(){const map=readFileSync("/proc/self/uid_map","utf8").trim().split(/\s+/).map(Number);return process.getuid?.()===0&&map.length>=3&&map[0]===0&&map[1]!==0&&map[2]===1;}
function status(mode:"disabled"|"armed",authority?:ZapReceiptAuthority){return {service:"bitcoinwalk-rustress-receipt",version,mode,receiptsEnabled:mode==="armed",signerConfigured:mode==="armed",relayEgressConfigured:mode==="armed",networkAccess:false,states:authority?.status()??{}};}
function server(handler:(request:IncomingMessage)=>Promise<{status:number;body:unknown}>){const value=createServer((request,response)=>{void handler(request).then(result=>{const document=JSON.stringify(result.body);response.writeHead(result.status,{"content-length":Buffer.byteLength(document),"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(document);}).catch(()=>{response.writeHead(400,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify({error:"request-rejected"}));});});value.requestTimeout=10000;value.headersTimeout=5000;value.maxRequestsPerSocket=4;return value;}

async function main(){
 if(!rootless())throw new Error();process.umask(0o077);protectedPath(stateRoot,"directory",0o700);
 const mode=z.enum(["disabled","armed"]).parse(read(join(configRoot,"receipt-mode")));
 let db:DatabaseSync|undefined;
 if(mode==="disabled"){
  const listener=server(async request=>request.method==="GET"&&(request.url==="/health"||request.url==="/v1/status")?{status:200,body:status("disabled")}:{status:404,body:{error:"not-found"}});
  listener.listen(8894,"127.0.0.1");let stopping=false;const stop=()=>{if(stopping)return;stopping=true;listener.close(()=>process.exit(0));};process.on("SIGTERM",stop);process.on("SIGINT",stop);return;
 }
 try{
  const provider=read(join(configRoot,"provider-pubkey"),/^[0-9a-f]{64}$/),evidenceToken=read(join(secretRoot,"receipt-evidence-token"),tokenPattern),signerToken=read(join(secretRoot,"signer-api-token"),tokenPattern),claimToken=read(join(secretRoot,"claim-api-token"),tokenPattern),egressToken=read(join(secretRoot,"relay-egress-api-token"),tokenPattern);
  if(new Set([evidenceToken,signerToken,claimToken,egressToken]).size!==4)throw new Error();
  protectedSocket(evidenceSocket);protectedSocket(signerSocket);protectedSocket(egressSocket);
  const databasePath=join(stateRoot,"authority.sqlite");try{protectedPath(databasePath,"file",0o600);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  db=new DatabaseSync(databasePath);chmodSync(databasePath,0o600);db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
  const evidence=new ReceiptEvidenceClient(evidenceToken,evidenceSocket),signer=new ReceiptSignerSocketClient(provider,signerSocket,signerToken),publisher=new ReceiptRelayEgressClient(egressSocket,egressToken);
  const authority=new ZapReceiptAuthority(db,signer,claim=>evidence.get(claim),publisher);
  protectedPath(dirname(intakeSocket),"directory",0o700);
  try{protectedSocket(intakeSocket);rmSync(intakeSocket);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  const listener=createServer(receiptIntakeHandler(provider,claimToken,authority,()=>status("armed",authority)));
  listener.requestTimeout=10000;listener.headersTimeout=5000;listener.maxRequestsPerSocket=4;
  await new Promise<void>((resolve,reject)=>{listener.once("error",reject);listener.listen(intakeSocket,()=>{chmodSync(intakeSocket,0o600);resolve();});});
  let stopping=false,cycle:Promise<unknown>|undefined;
  const tick=()=>{if(stopping||cycle)return;cycle=authority.retryPending().catch(()=>{process.stderr.write("Receipt retry cycle unavailable.\n");}).finally(()=>{cycle=undefined;});};
  const timer=setInterval(tick,15000);timer.unref?.();tick();
  const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);listener.close(()=>{void Promise.resolve(cycle).finally(()=>{rmSync(intakeSocket,{force:true});db!.close();process.exit(0);});});};process.on("SIGTERM",stop);process.on("SIGINT",stop);
 }catch(error){db?.close();throw error;}
}
main().catch(()=>{process.stderr.write("BitcoinWalk receipt worker refused to start.\n");process.exitCode=1;});
