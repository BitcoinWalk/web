import {randomBytes} from "node:crypto";
import {chmodSync,closeSync,lstatSync,openSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {getPublicKey} from "nostr-tools";
import {ReceiptSignerStore} from "../src/rustress/receipt-signer";

const root="/var/lib/bitcoinwalk-receipt-bootstrap",secrets=join(root,"secrets"),config=join(root,"config"),state=join(root,"signer");
const secretPath=join(secrets,"provider-secret-key"),publicPath=join(config,"provider-pubkey"),databasePath=join(state,"signer.sqlite");

function directory(path:string){
 const value=lstatSync(path);if(!value.isDirectory()||value.isSymbolicLink()||(value.mode&0o777)!==0o700||value.uid!==0||realpathSync(path)!==path)throw new Error();
}
function exclusive(path:string,value:string){const descriptor=openSync(path,"wx",0o600);try{writeFileSync(descriptor,`${value}\n`); }finally{closeSync(descriptor);}chmodSync(path,0o600);}
function main(){
 if(process.getuid?.()!==0)throw new Error();
 const map=readFileSync("/proc/self/uid_map","utf8").trim().split(/\s+/).map(Number);if(map.length<3||map[0]!==0||map[1]===0||map[2]!==1)throw new Error();
 process.umask(0o077);for(const path of [root,secrets,config,state])directory(path);
 for(const path of [secretPath,publicPath,databasePath]){try{lstatSync(path);throw new Error();}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}
 let secret="",publicKey="";const created:string[]=[];
 try{
  do{secret=randomBytes(32).toString("hex");try{publicKey=getPublicKey(Uint8Array.from(Buffer.from(secret,"hex")));}catch{publicKey="";}}while(!publicKey);
  exclusive(secretPath,secret);created.push(secretPath);exclusive(publicPath,publicKey);created.push(publicPath);
  const db=new DatabaseSync(databasePath);created.push(databasePath);try{db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");new ReceiptSignerStore(db,publicKey,async()=>{throw new Error();});}finally{db.close();}chmodSync(databasePath,0o600);
  process.stdout.write(`RECEIPT_PROVIDER_IDENTITY_CREATED pubkey=${publicKey}\n`);
 }catch(error){for(const path of created.reverse())rmSync(path,{force:true});throw error;}
}
try{main();}catch{process.stderr.write("Receipt provider identity initialization refused.\n");process.exitCode=1;}
