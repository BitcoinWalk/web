import {createServer} from "node:http";
import {lstat,readFile,realpath} from "node:fs/promises";

const version="0.1.0";
const modePath="/run/bitcoinwalk-config/payout-mode";
const credentialPath="/run/bitcoinwalk-secrets/nwc-uri";
const statePath="/var/lib/bitcoinwalk-payout";

async function protectedPath(path:string,type:"file"|"directory",mode:number){
 const stat=await lstat(path);
 if(stat.isSymbolicLink()||(type==="file"?!stat.isFile():!stat.isDirectory())||(stat.mode&0o777)!==mode||stat.uid!==0||await realpath(path)!==path)throw new Error();
 return stat;
}

async function main(){
 const map=(await readFile("/proc/self/uid_map","utf8")).trim().split(/\s+/).map(Number);
 // Namespace root must map to the dedicated non-root host account.
 if(!process.getuid||process.getuid()!==0||map.length<3||map[0]!==0||map[1]===0||map[2]!==1)throw new Error();
 process.umask(0o077);
 await protectedPath(modePath,"file",0o600);
 await protectedPath(credentialPath,"file",0o600);
 await protectedPath(statePath,"directory",0o700);
 const mode=(await readFile(modePath,"utf8")).trim();
 if(mode!=="disabled")throw new Error();
 // Intentionally do not read the NWC file while disabled. The stopped payment
 // boundary is additionally enforced by Docker's network=none deployment.
 const status=Object.freeze({service:"bitcoinwalk-rustress-payout",version,mode:"disabled",payoutsEnabled:false,
  invoiceIssuanceEnabled:false,credentialLoaded:false,automationRunning:false,networkAccess:false});
 const server=createServer((request,response)=>{
  const ok=request.method==="GET"&&(request.url==="/health"||request.url==="/v1/status");
  response.writeHead(ok?200:404,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});
  response.end(JSON.stringify(ok?status:{error:"not-found"}));
 });
 server.listen(8893,"127.0.0.1");
 let stopping=false;
 const stop=()=>{if(stopping)return;stopping=true;server.close(()=>process.exit(0));};
 process.on("SIGTERM",stop);process.on("SIGINT",stop);
}
main().catch(()=>{process.stderr.write("Rustress payout service refused to start.\n");process.exitCode=1;});
