import {lstatSync} from "node:fs";
import {userInfo} from "node:os";
import {DatabaseSync} from "node:sqlite";
import {importMadeiraPublicIdentity} from "../src/rustress/public-identity-store";

const [sourcePath,targetArgument]=process.argv.slice(2),verifyOnly=targetArgument==="--verify-only";
const targetPath=verifyOnly?":memory:":targetArgument;
if(userInfo().username!=="bitcoinwalk"||process.getuid?.()===0)throw new Error("Run as the non-root bitcoinwalk user.");
if(sourcePath!=="/var/lib/bitcoinwalk-app-staging/payments.sqlite"||!verifyOnly&&targetPath!=="/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite")
  throw new Error("Exact staging source and production target paths are required.");
for(const path of verifyOnly?[sourcePath]:[sourcePath,targetPath]){const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Identity database path is not a regular file.");}
const source=new DatabaseSync(sourcePath,{readOnly:true}),target=new DatabaseSync(targetPath);
try{target.exec("PRAGMA foreign_keys=ON");const result=importMadeiraPublicIdentity(source,target);
  process.stdout.write(`MADEIRA_PRODUCTION_NIP05_IDENTITY_OK mode=${verifyOnly?"verify-only":"import"} created=${result.created} localPart=${result.identity?.localPart} evidence=${result.evidenceHash}\n`);
}finally{source.close();target.close();}
