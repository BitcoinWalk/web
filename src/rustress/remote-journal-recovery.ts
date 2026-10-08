import type {PayoutLedger} from "./payout-ledger";
import type {PayoutWallet} from "./payout-worker";
import {RemoteJournalClient} from "./remote-journal-client";

/** Remote alternative, NOT a bypass of the local-filesystem verifier. Deployment
 * approval must verify distinct hosts, private tunnel, independent backup policy
 * and exclusively stopped senders. Fence changes cannot cancel an in-flight pay. */
export class RemoteJournalRecovery {
 #ready=false;#generation=0;#fence:string|null=null;
 constructor(private client:RemoteJournalClient,private ledger:PayoutLedger,private walletRef:string,
  private history:()=>Promise<{binding:string;complete:boolean;outgoingHashes:string[]}>,private lookup:PayoutWallet["lookup"],
  private deploymentReady:()=>boolean=()=>false){}
 get ready(){return this.#ready;}
 pause(){this.#ready=false;this.#generation++;this.#fence=null;}
 async reconcile(){
  this.pause();const generation=this.#generation;
  try{
   if(!this.deploymentReady())throw new Error();
   const state=await this.client.status();if(!state.active||!state.fence)throw new Error();
   const entries:Awaited<ReturnType<RemoteJournalClient["page"]>>["entries"]=[];let after=0;
   for(;;){
    const page=await this.client.page(after);
    if(!page.state.active||page.state.fence!==state.fence||page.state.lastSequence!==state.lastSequence)throw new Error();
    for(const entry of page.entries){if(entry.sequence<=after)throw new Error();after=entry.sequence;entries.push(entry);}
    if(entries.length>10000)throw new Error();if(page.entries.length<50)break;
   }
   if(after!==state.lastSequence||new Set(entries.map(e=>e.id)).size!==entries.length||new Set(entries.map(e=>e.hash)).size!==entries.length)throw new Error();
   const history=await this.history();
   if(!history.complete||history.binding!==this.client.binding||new Set(history.outgoingHashes).size!==history.outgoingHashes.length||history.outgoingHashes.some(hash=>!entries.some(e=>e.hash===hash)))throw new Error();
   const rows=this.ledger.recoveryAttempts(this.walletRef);
   if(rows.some(row=>["paid","unknown"].includes(row.state)&&!entries.some(e=>e.id===row.id)))throw new Error();
   for(const entry of entries){
    const row=rows.find(r=>r.id===entry.id);
    if(!row||row.hash!==entry.hash||row.commitment!==entry.commitment||row.state==="cancelled")throw new Error();
    this.ledger.quarantineAttempt(row.id);
    if(!history.outgoingHashes.includes(row.hash))throw new Error();
    const proof=await this.lookup(row.hash);if(proof.state!=="paid")throw new Error();
    this.ledger.confirmPaid(row.id,proof.walletRef,proof.paymentHash,proof.amountMsat,proof.feeMsat,proof.preimage);
   }
   const end=await this.client.status();
   if(!end.active||end.fence!==state.fence||end.lastSequence!==state.lastSequence||generation!==this.#generation||!this.deploymentReady())throw new Error();
   this.#fence=state.fence;this.#ready=true;return {state:"reconciled" as const};
  }catch{return {state:"blocked" as const};}
 }
 async claim(id:string){
  if(!this.#ready||!this.#fence)return false;
  const generation=this.#generation;
  try{
   if(!this.deploymentReady())throw new Error();
   const row=this.ledger.recoveryAttempts(this.walletRef).find(r=>r.id===id);if(!row||row.state!=="unknown")throw new Error();
   const receipt=await this.client.claim({serviceId:this.client.serviceId,binding:this.client.binding,fence:this.#fence,id:row.id,hash:row.hash,commitment:row.commitment});
   if(receipt.outcome!=="created"||generation!==this.#generation||!this.#ready||!this.deploymentReady())throw new Error();
   return true;
  }catch{this.pause();return false;}
 }
}
