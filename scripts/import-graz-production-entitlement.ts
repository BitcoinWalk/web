import {lstatSync} from "node:fs";
import {userInfo} from "node:os";
import {DatabaseSync,backup} from "node:sqlite";
import {importSettledCityEntitlement} from "../src/payments/production-entitlement-import";

const sourcePath="/var/lib/bitcoinwalk-app-staging/payments.sqlite";
const targetPath="/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite";
const expected={cityId:"e62592ac-a5fc-42df-8f31-94416f6ee8d5",owner:"34c784ebf8374eb2b9c10053350125da5fd98d99659921eaf7009a8546b3011a",
 revisionId:"eb0e605fe77701f0771682271090b995d9e46836c63b87b0186285f8f66e6f9e",invoiceId:"ee311949-7d70-4414-92e2-0a5969c4e618",amountMsat:21_000_000};

async function main(){
  if(userInfo().username!=="bitcoinwalk"||process.getuid?.()===0)throw new Error("Non-root bitcoinwalk user required.");
  const mode=process.argv[2];if(!["--verify-only","--apply"].includes(mode))throw new Error("Use --verify-only or --apply.");
  for(const path of [sourcePath,targetPath]){const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Exact regular database paths required.");}
  const source=new DatabaseSync(sourcePath,{readOnly:true}),target=new DatabaseSync(targetPath,{readOnly:mode!=="--apply"});
  try{
    const checked=importSettledCityEntitlement(source,target,expected,false);
    if(mode==="--verify-only"){console.log(`GRAZ_ENTITLEMENT_VERIFY_OK already_present=${!checked.created}`);return;}
    const evidence=`/home/bitcoinwalk/backups/graz-production-entitlement-${Date.now()}.sqlite`;await backup(target,evidence);
    target.exec("BEGIN IMMEDIATE");
    try{const result=importSettledCityEntitlement(source,target,expected,true);target.exec("COMMIT");console.log(`GRAZ_ENTITLEMENT_IMPORT_OK created=${result.created} backup=${evidence}`);}
    catch(error){target.exec("ROLLBACK");throw error;}
  }finally{source.close();target.close();}
}
process.umask(0o077);
main().catch(()=>{console.error("Graz production entitlement import refused; no payment or payout details logged.");process.exitCode=1;});
