export {};
async function main(){
 const response=await fetch("http://127.0.0.1:8896/health",{redirect:"error",signal:AbortSignal.timeout(3000),cache:"no-store"}),body=await response.json() as Record<string,unknown>;
 if(response.status!==200||body.service!=="bitcoinwalk-sponsor-payout"||body.version!=="0.1.0"||body.mode!=="disabled"||body.payoutsEnabled!==false||body.hostInvitationsEnabled!==false||body.credentialLoaded!==false||body.networkAccess!==false||body.restartReconciliation!=="blocked-disabled"||!Number.isSafeInteger(body.generation)||Number(body.generation)<1)throw new Error();
 process.stdout.write("SPONSOR_PAYOUT_DISABLED_OK\n");
}
main().catch(()=>{process.stderr.write("Sponsor payout service is not safely disabled.\n");process.exitCode=1;});
