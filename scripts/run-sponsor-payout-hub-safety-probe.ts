import {readFile,lstat} from "node:fs/promises";
import {PrivateNwcReadProbe} from "../src/rustress/nwc-transport";
import {requireHubPaymentSafetyCapability} from "../src/rustress/hub-capability";

async function main(){
 if(process.argv.length!==3||!process.getuid)throw new Error();
 const path=process.argv[2],stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||!([0o400,0o600].includes(stat.mode&0o777))||stat.size<80||stat.size>8193)throw new Error();
 const credential=(await readFile(path,"utf8")).trim(),probe=new PrivateNwcReadProbe("bitcoinwalk-sponsor-payout",credential);
 try{requireHubPaymentSafetyCapability(await probe.getInfo());process.stdout.write("SPONSOR_PAYOUT_REVIEWED_NATIVE_FEE_CAP_VERIFIED\n");}
 catch{process.stdout.write("SPONSOR_PAYOUT_NATIVE_FEE_CAP_NOT_ADVERTISED\n");process.exitCode=2;}
}
main().catch(()=>{process.stderr.write("Sponsor payout Hub safety probe could not be verified.\n");process.exitCode=1;});
