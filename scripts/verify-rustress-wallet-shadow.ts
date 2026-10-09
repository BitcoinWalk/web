import {readFile} from "node:fs/promises";

async function main(){
 const token=(await readFile("/run/bitcoinwalk-secrets/shadow-api-token","utf8")).trim();
 const response=await fetch("http://127.0.0.1:8892/v1/readiness",{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});
 const body=await response.json() as Record<string,unknown>;
 if(response.status!==200||body.state!=="verified"||body.network!=="mainnet"||body.invoiceIssuanceEnabled!==false||body.payoutsEnabled!==false||body.historyReadable!==true||!Array.isArray(body.successfulReadMethods)||body.successfulReadMethods.join(",")!=="get_info,list_transactions"||typeof body.binding!=="string"||!/^[0-9a-f]{64}$/.test(body.binding))throw new Error();
 process.stdout.write("RUSTRESS_WALLET_SHADOW_READY\n");
}
main().catch(()=>{process.stderr.write("Rustress wallet shadow is not ready.\n");process.exitCode=1;});
