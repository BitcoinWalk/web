import {chmodSync,lstatSync,readFileSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {ZapReceiptAuthority} from "../src/rustress/zap-receipt-authority";

const root="/var/lib/bitcoinwalk-receipt-worker",path=join(root,"authority.sqlite");
function main(){
 const map=readFileSync("/proc/self/uid_map","utf8").trim().split(/\s+/).map(Number),dir=lstatSync(root);
 if(process.getuid?.()!==0||map.length<3||map[0]!==0||map[1]===0||map[2]!==1||!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o777)!==0o700||dir.uid!==0||realpathSync(root)!==root)throw new Error();
 try{const file=lstatSync(path);if(!file.isFile()||file.isSymbolicLink()||(file.mode&0o777)!==0o600||file.uid!==0||file.nlink!==1||realpathSync(path)!==path)throw new Error();}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
 const db=new DatabaseSync(path);try{chmodSync(path,0o600);db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");new ZapReceiptAuthority(db,{publicKey:"0".repeat(64),sign:async()=>{throw new Error();}},async()=>null,{publish:async()=>[]});if(Object.values(db.prepare("PRAGMA integrity_check").get()!)[0]!=="ok")throw new Error();}finally{db.close();}
 process.stdout.write("RECEIPT_WORKER_STATE_INITIALIZED\n");
}
try{main();}catch{process.stderr.write("Receipt worker state initialization refused.\n");process.exitCode=1;}
