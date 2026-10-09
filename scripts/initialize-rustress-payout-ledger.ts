import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {PayoutLedger} from "../src/rustress/payout-ledger";
import {PayoutAuthorityStore} from "../src/rustress/payout-authority";
const root="/var/lib/bitcoinwalk-payout",map=readFileSync("/proc/self/uid_map","utf8").trim().split(/\s+/).map(Number),stat=lstatSync(root);
if(process.getuid?.()!==0||map.length<3||map[0]!==0||map[1]===0||map[2]!==1||!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||stat.uid!==0||realpathSync(root)!==root)throw new Error();
process.umask(0o077);const db=new DatabaseSync(join(root,"ledger.sqlite"));db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");new PayoutLedger(db);new PayoutAuthorityStore(db);
if(Object.values(db.prepare("PRAGMA integrity_check").get()!)[0]!=="ok")throw new Error();db.close();process.stdout.write("RUSTRESS_PAYOUT_LEDGER_INITIALIZED\n");
