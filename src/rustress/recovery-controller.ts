import type {DatabaseSync} from "node:sqlite";
import type {RustressNwcReader} from "./nwc-reader";
import type {PayoutLedger} from "./payout-ledger";
import {PayoutRecovery} from "./payout-recovery";
import {createRecoveryHistory,type RecoveryCoverage} from "./recovery-history";
import {inspectJournalStorage} from "./journal-storage";

/** Server-only composition; no credentials or files are created. Paths are read
 * from actual open SQLite handles, not supplied display paths. Deployment still
 * requires independently audited backup/failure domains and stopped senders. */
export function createRecoveryController(ledger:PayoutLedger,journal:DatabaseSync,
 reader:Pick<RustressNwcReader,"walletRef"|"binding"|"listRecoveryTransactions"|"lookupPayout">,
 coverage:()=>Promise<RecoveryCoverage>,now=()=>Math.floor(Date.now()/1000)){
 const storageReady=()=>{
  const path=String(journal.prepare("PRAGMA database_list").all().find(row=>row.name==="main")?.file??"");
  return inspectJournalStorage(ledger.databasePath(),path).state==="filesystem-separated";
 };
 return new PayoutRecovery(journal,ledger,reader.walletRef,reader.binding,
  createRecoveryHistory(reader,coverage,now),hash=>reader.lookupPayout(hash),storageReady);
}
