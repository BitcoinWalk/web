async function main(){
 const response=await fetch("http://127.0.0.1:8893/v1/status",{signal:AbortSignal.timeout(5000)});
 const body=await response.json() as Record<string,unknown>;
 if(response.status!==200||body.service!=="bitcoinwalk-rustress-payout"||body.version!=="0.2.5"||body.mode!=="disabled"||
  body.payoutsEnabled!==false||body.invoiceIssuanceEnabled!==false||body.credentialLoaded!==false||body.automationRunning!==false||body.networkAccess!==false)throw new Error();
 process.stdout.write("RUSTRESS_PAYOUT_SERVICE_DISABLED\n");
}
main().catch(()=>{process.stderr.write("Rustress payout service is not safely disabled.\n");process.exitCode=1;});
