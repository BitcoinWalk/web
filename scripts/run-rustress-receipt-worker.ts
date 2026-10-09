import {timingSafeEqual} from "node:crypto";
import {chmodSync,lstatSync,readFileSync,realpathSync} from "node:fs";
import {createServer,type IncomingMessage} from "node:http";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {ReceiptEvidenceClient} from "../src/rustress/receipt-evidence-client";
import {ReceiptRelayEgressClient} from "../src/rustress/receipt-relay-egress";
import {ReceiptSignerSocketClient} from "../src/rustress/receipt-signer-socket";
import {ZapReceiptAuthority} from "../src/rustress/zap-receipt-authority";

const version="0.1.0",configRoot="/run/bitcoinwalk-receipt-worker/config",secretRoot="/run/bitcoinwalk-receipt-worker/secrets",stateRoot="/var/lib/bitcoinwalk-receipt-worker",signerSocket="/run/bitcoinwalk-receipt-signer/socket/signer.sock",egressSocket="/run/bitcoinwalk-receipt-egress/socket/relay.sock";
const tokenPattern=/^[A-Za-z0-9_-]{43,256}$/;
function protectedPath(path:string,type:"file"|"directory",mode:number){const stat=lstatSync(path);if(stat.isSymbolicLink()||(type==="file"?!stat.isFile():!stat.isDirectory())||(stat.mode&0o777)!==mode||stat.uid!==0||realpathSync(path)!==path||type==="file"&&stat.nlink!==1)throw new Error();return stat;}
function protectedSocket(path:string){const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isSocket()||(stat.mode&0o777)!==0o600||stat.uid!==0||realpathSync(path)!==path)throw new Error();}
function read(path:string,pattern?:RegExp,max=65536){const stat=protectedPath(path,"file",0o600);if(stat.size<1||stat.size>max)throw new Error();const value=readFileSync(path,"utf8").trim();if(pattern&&!pattern.test(value))throw new Error();return value;}
function rootless(){const map=readFileSync("/proc/self/uid_map","utf8").trim().split(/\s+/).map(Number);return process.getuid?.()===0&&map.length>=3&&map[0]===0&&map[1]!==0&&map[2]===1;}
function allowed(value:string|undefined,expected:string){const supplied=value?.startsWith("Bearer ")?value.slice(7):"",left=Buffer.from(supplied),right=Buffer.from(expected);return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);}
async function body(request:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of request){const value=Buffer.from(chunk);size+=value.length;if(size>98304)throw new Error();chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;}
function status(mode:"disabled"|"armed",authority?:ZapReceiptAuthority){return {service:"bitcoinwalk-rustress-receipt",version,mode,receiptsEnabled:mode==="armed",signerConfigured:mode==="armed",relayEgressConfigured:mode==="armed",networkAccess:false,states:authority?.status()??{}};}
function server(handler:(request:IncomingMessage)=>Promise<{status:number;body:unknown}>){const value=createServer((request,response)=>{void handler(request).then(result=>{response.writeHead(result.status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify(result.body));}).catch(()=>{response.writeHead(400,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify({error:"request-rejected"}));});});value.requestTimeout=10000;value.headersTimeout=5000;value.maxRequestsPerSocket=4;return value;}

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
  protectedSocket(signerSocket);protectedSocket(egressSocket);
  const databasePath=join(stateRoot,"authority.sqlite");try{protectedPath(databasePath,"file",0o600);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  db=new DatabaseSync(databasePath);chmodSync(databasePath,0o600);db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
  const evidence=new ReceiptEvidenceClient(evidenceToken),signer=new ReceiptSignerSocketClient(provider,signerSocket,signerToken),publisher=new ReceiptRelayEgressClient(egressSocket,egressToken);
  const authority=new ZapReceiptAuthority(db,signer,claim=>evidence.get(claim),publisher);
  const listener=server(async request=>{
   if(request.method==="GET"&&request.url==="/health")return {status:200,body:status("armed",authority)};
   if(request.method!=="POST"||request.url!=="/v1/receipts")return {status:404,body:{error:"not-found"}};
   if(!allowed(request.headers.authorization,claimToken))return {status:401,body:{error:"unauthorized"}};
   if(!request.headers["content-type"]?.toLowerCase().startsWith("application/json"))return {status:415,body:{error:"unsupported-media-type"}};
   return {status:200,body:await authority.issue(await body(request))};
  });
  listener.listen(8894,"127.0.0.1");let stopping=false;const stop=()=>{if(stopping)return;stopping=true;listener.close(()=>{db!.close();process.exit(0);});};process.on("SIGTERM",stop);process.on("SIGINT",stop);
 }catch(error){db?.close();throw error;}
}
main().catch(()=>{process.stderr.write("BitcoinWalk receipt worker refused to start.\n");process.exitCode=1;});
