import {createServer} from "node:http";
import {lstat,readFile} from "node:fs/promises";
import {PrivateNwcReadProbe} from "../src/rustress/nwc-transport";
import {RustressWalletShadow} from "../src/rustress/wallet-shadow";

const credentialPath="/run/bitcoinwalk-secrets/nwc-uri";
const tokenPath="/run/bitcoinwalk-secrets/shadow-api-token";

async function protectedValue(path:string,pattern:RegExp,min:number,max:number){
 const stat=await lstat(path);
 if(!process.getuid||process.getuid()!==0||!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==0||stat.size<min||stat.size>max)throw new Error();
 const value=(await readFile(path,"utf8")).trim();if(!pattern.test(value))throw new Error();return value;
}
async function main(){
 const map=(await readFile("/proc/self/uid_map","utf8")).trim().split(/\s+/).map(Number);
 // Namespace root must map to the dedicated non-root host user, never host root.
 if(map.length<3||map[0]!==0||map[1]===0||map[2]!==1)throw new Error();
 const credential=await protectedValue(credentialPath,/^nostr\+walletconnect:\/\//,80,8193);
 const token=await protectedValue(tokenPath,/^[0-9a-f]{64}$/,64,65);
 const setgroups=process.setgroups,setgid=process.setgid,setuid=process.setuid,getuid=process.getuid,getgid=process.getgid;
 if(!setgroups||!setgid||!setuid||!getuid||!getgid)throw new Error();
 setgroups.call(process,[]);setgid.call(process,1004);setuid.call(process,1004);
 if(getuid.call(process)!==1004||getgid.call(process)!==1004)throw new Error();
 const probe=new PrivateNwcReadProbe("bitcoinwalk-rustress",credential);
 const shadow=new RustressWalletShadow(probe,token);
 const interval=Number(process.env.SHADOW_PROBE_INTERVAL_MS??"300000");
 if(!Number.isSafeInteger(interval)||interval<60000||interval>3600000)throw new Error();
 const server=createServer((request,response)=>{
  const result=shadow.route(request.method,request.url,request.headers.authorization);
  response.writeHead(result.status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify(result.body));
 });
 server.listen(8892,"0.0.0.0",()=>{void shadow.refresh();});
 const timer=setInterval(()=>{void shadow.refresh();},interval);timer.unref();
 const stop=()=>{clearInterval(timer);server.close(()=>process.exit(0));};process.on("SIGTERM",stop);process.on("SIGINT",stop);
}
main().catch(()=>{process.stderr.write("Rustress wallet shadow could not start.\n");process.exitCode=1;});
