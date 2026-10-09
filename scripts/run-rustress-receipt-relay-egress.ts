import {promises as dns} from "node:dns";
import {chmodSync,lstatSync,readFileSync,realpathSync,rmSync} from "node:fs";
import {createServer} from "node:http";
import {dirname,join} from "node:path";
import {PinnedZapWebSocketTransport} from "../src/rustress/pinned-zap-websocket";
import {receiptRelayEgressHandler} from "../src/rustress/receipt-relay-egress";
import {HardenedZapRelayPublisher} from "../src/rustress/zap-relay-publisher";

const configRoot="/run/bitcoinwalk-receipt-egress/config",secretRoot="/run/bitcoinwalk-receipt-egress/secrets",socketPath="/run/bitcoinwalk-receipt-egress/socket/relay.sock";
function read(path:string,pattern?:RegExp,max=65536){const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o777)!==0o600||stat.uid!==0||stat.nlink!==1||realpathSync(path)!==path||stat.size<1||stat.size>max)throw new Error();const value=readFileSync(path,"utf8").trim();if(pattern&&!pattern.test(value))throw new Error();return value;}
function main(){
 const map=readFileSync("/proc/self/uid_map","utf8").trim().split(/\s+/).map(Number),dir=lstatSync(dirname(socketPath));if(process.getuid?.()!==0||map.length<3||map[0]!==0||map[1]===0||map[2]!==1||!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o777)!==0o700||dir.uid!==0||realpathSync(dirname(socketPath))!==dirname(socketPath))throw new Error();
 const provider=read(join(configRoot,"provider-pubkey"),/^[0-9a-f]{64}$/),allowlist=JSON.parse(read(join(configRoot,"relay-allowlist.json"))) as string[],token=read(join(secretRoot,"relay-egress-api-token"),/^[A-Za-z0-9_-]{43,256}$/);
 try{const stat=lstatSync(socketPath);if(!stat.isSocket()||stat.isSymbolicLink())throw new Error();rmSync(socketPath);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
 const publisher=new HardenedZapRelayPublisher(allowlist,async hostname=>(await dns.lookup(hostname,{all:true,verbatim:true})).map(row=>({address:row.address,family:row.family as 4|6})),new PinnedZapWebSocketTransport()),server=createServer(receiptRelayEgressHandler(provider,publisher,token));server.requestTimeout=20000;server.headersTimeout=5000;server.maxRequestsPerSocket=4;
 server.listen(socketPath,()=>chmodSync(socketPath,0o600));let stopping=false;const stop=()=>{if(stopping)return;stopping=true;server.close(()=>{rmSync(socketPath,{force:true});process.exit(0);});};process.on("SIGTERM",stop);process.on("SIGINT",stop);
}
try{main();}catch{process.stderr.write("Receipt relay egress refused to start.\n");process.exitCode=1;}
