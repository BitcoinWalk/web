const expected=process.argv[2]??"disabled";
if(expected!=="disabled"&&expected!=="armed")process.exit(1);
fetch("http://127.0.0.1:8894/health",{signal:AbortSignal.timeout(3000)}).then(async response=>{const body=await response.json() as Record<string,unknown>;if(response.status!==200||body.service!=="bitcoinwalk-rustress-receipt"||body.mode!==expected||body.receiptsEnabled!==(expected==="armed")||body.networkAccess!==(expected==="armed"))throw new Error();process.stdout.write("RUSTRESS_RECEIPT_WORKER_OK\n");}).catch(()=>{process.exitCode=1;});
