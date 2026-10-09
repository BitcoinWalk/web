import {createServer} from "node:http";
import {chmodSync,lstatSync,readFileSync,realpathSync,rmSync} from "node:fs";
import {dirname,join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {receiptSignerHandler} from "../src/rustress/receipt-signer-socket";
import {ReceiptSignerStore} from "../src/rustress/receipt-signer";

const configRoot="/run/bitcoinwalk-receipt-signer/config",secretRoot="/run/bitcoinwalk-receipt-signer/secrets",stateRoot="/var/lib/bitcoinwalk-receipt-signer",socketPath="/run/bitcoinwalk-receipt-signer/socket/signer.sock";
function protectedPath(path:string,type:"file"|"directory",mode:number){
 const stat=lstatSync(path);
 if(stat.isSymbolicLink()||(type==="file"?!stat.isFile():!stat.isDirectory())||(stat.mode&0o777)!==mode||stat.uid!==0||realpathSync(path)!==path||type==="file"&&stat.nlink!==1)throw new Error();
 return stat;
}
function read(path:string,pattern:RegExp,max=1024){const stat=protectedPath(path,"file",0o600);if(stat.size<1||stat.size>max)throw new Error();const value=readFileSync(path,"utf8").trim();if(!pattern.test(value))throw new Error();return value;}
function rootless(){const map=readFileSync("/proc/self/uid_map","utf8").trim().split(/\s+/).map(Number);return process.getuid?.()===0&&map.length>=3&&map[0]===0&&map[1]!==0&&map[2]===1;}

async function main(){
 if(!rootless())throw new Error();process.umask(0o077);
 protectedPath(stateRoot,"directory",0o700);protectedPath(dirname(socketPath),"directory",0o700);
 const secret=read(join(secretRoot,"provider-secret-key"),/^[0-9a-f]{64}$/),token=read(join(secretRoot,"signer-api-token"),/^[A-Za-z0-9_-]{43,256}$/),expected=read(join(configRoot,"provider-pubkey"),/^[0-9a-f]{64}$/);
 const key=Uint8Array.from(Buffer.from(secret,"hex")),publicKey=getPublicKey(key);if(publicKey!==expected)throw new Error();
 try{const stat=lstatSync(socketPath);if(!stat.isSocket()||stat.isSymbolicLink())throw new Error();rmSync(socketPath);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
 const databasePath=join(stateRoot,"signer.sqlite");try{protectedPath(databasePath,"file",0o600);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
 const db=new DatabaseSync(databasePath);chmodSync(databasePath,0o600);db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
 const store=new ReceiptSignerStore(db,publicKey,template=>Promise.resolve(finalizeEvent(template,key))),server=createServer(receiptSignerHandler(store,token));
 server.requestTimeout=5000;server.headersTimeout=5000;server.maxRequestsPerSocket=1;
 await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(socketPath,()=>{chmodSync(socketPath,0o600);resolve();});});
 process.stdout.write("BitcoinWalk receipt signer is ready on its private socket.\n");
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;server.close(()=>{db.close();process.exit(0);});};process.on("SIGTERM",stop);process.on("SIGINT",stop);
}
main().catch(()=>{process.stderr.write("BitcoinWalk receipt signer refused to start.\n");process.exitCode=1;});
