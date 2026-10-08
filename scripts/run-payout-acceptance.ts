import {runPayoutAcceptance,scenarios} from "./payout-acceptance-fixture";
async function main(){
 if(process.getuid?.()===0)throw new Error("Non-root fixture required");
 process.umask(0o077);
 for(const scenario of scenarios){await runPayoutAcceptance(scenario);console.log(`PASS synthetic payout: ${scenario}`);}
 console.log("All fake-wallet acceptance scenarios passed. No live credentials, wallet or external payment endpoint used.");
}
void main().catch(()=>{console.error("Synthetic payout acceptance failed; live activation remains blocked.");process.exitCode=1;});
