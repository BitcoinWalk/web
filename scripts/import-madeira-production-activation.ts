import {lstatSync} from "node:fs";
import {userInfo} from "node:os";
import {DatabaseSync} from "node:sqlite";
import {importMadeiraProductionActivation} from "../src/rustress/production-activation-import";

const [sourcePath,targetPath]=process.argv.slice(2);
if(userInfo().username!=="bitcoinwalk"||process.getuid?.()===0||sourcePath!=="/var/lib/bitcoinwalk-app-staging/payments.sqlite"||targetPath!=="/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite")throw new Error("Exact non-root import paths required");
for(const path of [sourcePath,targetPath]){const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Database path is not a regular file");}
const source=new DatabaseSync(sourcePath,{readOnly:true}),target=new DatabaseSync(targetPath);
try{target.exec("PRAGMA foreign_keys=ON;BEGIN IMMEDIATE");const result=importMadeiraProductionActivation(source,target);target.exec("COMMIT");process.stdout.write(`MADEIRA_PRODUCTION_ACTIVATION_OK created=${result.created}\n`);}
catch(error){try{target.exec("ROLLBACK");}catch{}throw error;}finally{source.close();target.close();}
