import {lstatSync} from "node:fs";
import {userInfo} from "node:os";
import {backup,DatabaseSync} from "node:sqlite";
import {installMadeiraLegacyProEntitlement,verifyMadeiraLegacyProEntitlement} from "../src/payments/legacy-pro-entitlement";

const path=process.argv[2],mode=process.argv[3];
async function main(){
  if(userInfo().username!=="bitcoinwalk"||process.getuid?.()===0)throw new Error("Run as the non-root bitcoinwalk user.");
  if(!["/var/lib/bitcoinwalk-app-staging/payments.sqlite","/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite"].includes(path)||!["--verify-only","--apply"].includes(mode))
    throw new Error("Use an exact BitcoinWalk payments database path with --verify-only or --apply.");
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Payments database must be an exact regular file.");
  const db=new DatabaseSync(path,{readOnly:mode==="--verify-only"});
  try{
    if(mode==="--verify-only"){
      const result=verifyMadeiraLegacyProEntitlement(db);console.log(`MADEIRA_LEGACY_PRO_VERIFY_OK evidence=${result.evidenceHash}`);
      return;
    }
    const evidence=`/home/bitcoinwalk/backups/madeira-legacy-pro-entitlement-${Date.now()}.sqlite`;await backup(db,evidence);
    db.exec("BEGIN IMMEDIATE");
    try{const result=installMadeiraLegacyProEntitlement(db);db.exec("COMMIT");console.log(`MADEIRA_LEGACY_PRO_INSTALL_OK created=${result.created} backup=${evidence} evidence=${result.entitlement.evidenceHash}`);}
    catch(error){db.exec("ROLLBACK");throw error;}
  }finally{db.close();}
}
process.umask(0o077);
main().catch(()=>{console.error("Madeira legacy Pro entitlement installation refused; no private payout details logged.");process.exitCode=1;});
