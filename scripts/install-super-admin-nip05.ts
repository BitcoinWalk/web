import {lstatSync} from "node:fs";
import {userInfo} from "node:os";
import {DatabaseSync} from "node:sqlite";
import {installSuperAdminRootIdentity} from "../src/rustress/public-identity-store";

const [databasePath]=process.argv.slice(2);
if(userInfo().username!=="bitcoinwalk"||process.getuid?.()===0)throw new Error("Run as the non-root bitcoinwalk user.");
if(databasePath!=="/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite")throw new Error("Exact production database path required.");
const stat=lstatSync(databasePath);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Identity database path is not a regular file.");
const db=new DatabaseSync(databasePath);
try{const result=installSuperAdminRootIdentity(db);process.stdout.write(`BITCOINWALK_ROOT_NIP05_OK created=${result.created} identifier=bitcoinwalk.org evidence=${result.evidenceHash}\n`);}
finally{db.close();}
