import {request} from "node:http";
const expected=process.argv[2]??"disabled";
if(expected!=="disabled"&&expected!=="armed")process.exit(1);
const health=expected==="disabled"?fetch("http://127.0.0.1:8894/health",{signal:AbortSignal.timeout(3000)}).then(async response=>({status:response.status,body:await response.json()})):new Promise<{status:number|undefined;body:unknown}>((resolve,reject)=>{
 const req=request({socketPath:"/run/bitcoinwalk-receipt-worker/socket/intake.sock",path:"/health",timeout:3000},response=>{let text="";response.on("data",chunk=>{text+=chunk;if(text.length>16384)response.destroy(new Error());});response.on("error",reject);response.on("end",()=>{try{resolve({status:response.statusCode,body:JSON.parse(text)});}catch{reject(new Error());}});});req.on("timeout",()=>req.destroy(new Error()));req.on("error",reject);req.end();
});
health.then(({status,body:value})=>{const body=value as Record<string,unknown>;if(status!==200||body.service!=="bitcoinwalk-rustress-receipt"||body.mode!==expected||body.receiptsEnabled!==(expected==="armed")||body.relayEgressConfigured!==(expected==="armed")||body.networkAccess!==false)throw new Error();process.stdout.write("RUSTRESS_RECEIPT_WORKER_OK\n");}).catch(()=>{process.exitCode=1;});
