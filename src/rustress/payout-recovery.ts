import type {DatabaseSync} from "node:sqlite";
import type {PayoutLedger} from "./payout-ledger";
import type {PayoutWallet} from "./payout-worker";

type History={binding:string;complete:boolean;outgoingHashes:string[]};
type Entry={id:string;hash:string;commitment:string};
/** Separate durable send journal. MUST live outside the restored ledger/backup
 * domain. Both stores rolling back is undetectable here and requires independent
 * wallet-history reconciliation. No live collector or automatic resume daemon. */
export class PayoutRecovery {
 #ready=false;
 #generation=0;
 constructor(private journal:DatabaseSync,private ledger:PayoutLedger,private walletRef:string,private binding:string,
  private history:()=>Promise<History>,private lookup:PayoutWallet["lookup"],
  private storageReady:()=>boolean=()=>false){
  if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(walletRef)||!/^[0-9a-f]{64}$/.test(binding))throw new Error("Invalid recovery binding");
  journal.exec("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS bw_send_journal(binding TEXT NOT NULL,id TEXT NOT NULL,hash TEXT NOT NULL,commitment TEXT NOT NULL,PRIMARY KEY(binding,id),UNIQUE(binding,hash));");
 }
 pause(){this.#ready=false;this.#generation++;}
 get ready(){return this.#ready;}
 /** Call only after stopping/fencing all senders. History must cover the entire
  * exclusive connection, with authenticated pagination and no retention gap.
  * A collector must never manufacture complete=true from one empty page. */
 async reconcile(){
  this.pause();
  const generation=this.#generation;
  try{
   if(!this.storageReady())throw new Error();
   const history=await this.history();
   if(history.binding!==this.binding||!history.complete||history.outgoingHashes.some(h=>!/^[0-9a-f]{64}$/.test(h))||new Set(history.outgoingHashes).size!==history.outgoingHashes.length)throw new Error();
   const entries=this.journal.prepare("SELECT id,hash,commitment FROM bw_send_journal WHERE binding=?").all(this.binding) as Entry[];
   const attempts=this.ledger.recoveryAttempts(this.walletRef);
   // Unknown wallet sends or missing post-backup allocations cannot be assigned
   // to cities safely. Stop; never guess from amount, destination or timestamp.
   if(history.outgoingHashes.some(hash=>!entries.some(e=>e.hash===hash)))throw new Error();
   for(const row of attempts)if(["unknown","paid"].includes(row.state)&&!entries.some(e=>e.id===row.id))throw new Error();
   for(const entry of entries){
    const row=attempts.find(a=>a.id===entry.id);
    if(!row||row.commitment!==entry.commitment||row.hash!==entry.hash||row.state==="cancelled")throw new Error();
    this.ledger.quarantineAttempt(row.id);
    if(!history.outgoingHashes.includes(entry.hash))throw new Error();
    const result=await this.lookup(entry.hash);
    if(result.state!=="paid")throw new Error();
    this.ledger.confirmPaid(row.id,result.walletRef,result.paymentHash,result.amountMsat,result.feeMsat,result.preimage);
   }
   if(generation!==this.#generation||!this.storageReady())throw new Error();
   this.#ready=true;return {state:"reconciled" as const};
  }catch{return {state:"blocked" as const};}
 }
 /** Called after local budget claim but BEFORE any wallet send. Journal failure
  * leaves the local attempt unknown; uncertainty never permits a retry. */
 claim(id:string){
  if(!this.#ready)return false;
  try{
   if(!this.storageReady())throw new Error();
   const row=this.ledger.recoveryAttempts(this.walletRef).find(a=>a.id===id);
   if(!row||row.state!=="unknown")return false;
   this.journal.prepare("INSERT INTO bw_send_journal(binding,id,hash,commitment) VALUES(?,?,?,?)").run(this.binding,id,row.hash,row.commitment);
   return true;
  }catch{this.pause();return false;}
 }
}
