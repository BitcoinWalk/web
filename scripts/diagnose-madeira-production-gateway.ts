import {copyFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {importMadeiraProductionActivation} from "../src/rustress/production-activation-import";
import {loopbackVirtualHostRequest} from "../src/rustress/loopback-http";
import {managedLnurl} from "../src/server/rustress-public-gateway";

const sourcePath="/var/lib/bitcoinwalk-app-staging/payments.sqlite",productionPath="/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite",temporaryPath="/tmp/bitcoinwalk-madeira-gateway-diagnostic.sqlite";
async function main(){copyFileSync(productionPath,temporaryPath);const source=new DatabaseSync(sourcePath,{readOnly:true}),target=new DatabaseSync(temporaryPath);
 try{importMadeiraProductionActivation(source,target);const response=await managedLnurl("madeira","/.well-known/lnurlp/madeira","",{db:target,origin:"http://127.0.0.1:18895",transport:loopbackVirtualHostRequest,lnurlEnabled:()=>true});
  const value=await response.json() as Record<string,unknown>;process.stdout.write(JSON.stringify({status:response.status,contentType:response.headers.get("content-type"),tag:value.tag??null,reason:value.reason??null})+"\n");
 }finally{source.close();target.close();}}
main().catch(()=>{process.stderr.write("Madeira gateway diagnostic failed.\n");process.exitCode=1;});
