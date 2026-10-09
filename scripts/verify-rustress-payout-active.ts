import {lstat,readFile} from "node:fs/promises";
async function main(){
 const path="/run/bitcoinwalk-secrets/operations-api-token",stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==0||stat.size<43||stat.size>256)throw new Error();
 const token=(await readFile(path,"utf8")).trim();if(!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw new Error();
 const response=await fetch("http://127.0.0.1:8893/v1/status",{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)}),body=await response.json() as Record<string,unknown>;
 if(response.status!==200||body.service!=="bitcoinwalk-rustress-payout"||body.enabled!==true||body.running!==true||body.ready!==true||body.consecutiveFailures!==0||
  !Number.isSafeInteger(body.authorityRecords)||!Number.isSafeInteger(body.pendingIncoming)||!Number.isSafeInteger(body.prepared)||!Number.isSafeInteger(body.unknown)||!Number.isSafeInteger(body.paid))throw new Error();
 process.stdout.write("RUSTRESS_PAYOUT_ACTIVE_READY\n");
}
main().catch(()=>{process.stderr.write("Rustress payout service is not ready.\n");process.exitCode=1;});
