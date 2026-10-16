import type {SponsorPayoutStore} from "./sponsor-payout-sender";
import type {PayoutWallet} from "../rustress/payout-worker";
import type {RemoteJournalClient} from "../rustress/remote-journal-client";

type Client=Pick<RemoteJournalClient,"binding"|"serviceId"|"status"|"page"|"claim">;

/** Off-host fence for the sponsorship sender. A journal claim is permission for
 * one exact hash once; a recorded retry is recovery evidence, never permission
 * to send again. Wallet history must cover every journaled outgoing hash. */
export class SponsorPayoutRecovery{
 #ready=false;#generation=0;#fence:string|null=null;
 constructor(private client:Client,private store:SponsorPayoutStore,private walletRef:string,
 private history:()=>Promise<{binding:string;complete:boolean;outgoingHashes:string[]}>,private lookup:PayoutWallet["lookup"],
  private deploymentReady:()=>boolean=()=>false){}
 get binding(){return this.client.binding;}
 get serviceId(){return this.client.serviceId;}
 get ready(){return this.#ready;}
 pause(){this.#ready=false;this.#generation++;this.#fence=null;}
 async reconcile(){
  this.pause();const generation=this.#generation;
  try{
   if(!this.deploymentReady())throw new Error();const state=await this.client.status();if(!state.active||!state.fence)throw new Error();
   const entries:Awaited<ReturnType<Client["page"]>>["entries"]=[];let after=0;
   for(;;){const page=await this.client.page(after);if(!page.state.active||page.state.fence!==state.fence||page.state.lastSequence!==state.lastSequence)throw new Error();for(const entry of page.entries){if(entry.sequence<=after)throw new Error();after=entry.sequence;entries.push(entry);}if(entries.length>10000)throw new Error();if(page.entries.length<50)break;}
   if(after!==state.lastSequence||new Set(entries.map(entry=>entry.id)).size!==entries.length||new Set(entries.map(entry=>entry.hash)).size!==entries.length)throw new Error();
   const history=await this.history();if(!history.complete||history.binding!==this.client.binding||new Set(history.outgoingHashes).size!==history.outgoingHashes.length||history.outgoingHashes.some(hash=>!entries.some(entry=>entry.hash===hash)))throw new Error();
   const rows=this.store.recoveryAttempts(this.walletRef);if(rows.some(row=>["unknown","paid"].includes(row.state)&&!entries.some(entry=>entry.id===row.id)))throw new Error();
   for(const entry of entries){const row=rows.find(candidate=>candidate.id===entry.id);if(!row||row.hash!==entry.hash||row.commitment!==entry.commitment||row.state==="cancelled")throw new Error();this.store.quarantineAttempt(row.id);if(!history.outgoingHashes.includes(row.hash))throw new Error();const proof=await this.lookup(row.hash);if(proof.state!=="paid")throw new Error();this.store.confirmPaid(row.id,proof);}
   const end=await this.client.status();if(!end.active||end.fence!==state.fence||end.lastSequence!==state.lastSequence||generation!==this.#generation||!this.deploymentReady())throw new Error();
   this.#fence=state.fence;this.#ready=true;return {state:"reconciled" as const};
  }catch{return {state:"blocked" as const};}
 }
 async claim(id:string){
  if(!this.#ready||!this.#fence)return false;const generation=this.#generation;
  try{if(!this.deploymentReady())throw new Error();const row=this.store.recoveryAttempts(this.walletRef).find(candidate=>candidate.id===id);if(!row||row.state!=="unknown")throw new Error();const receipt=await this.client.claim({serviceId:this.client.serviceId,binding:this.client.binding,fence:this.#fence,id:row.id,hash:row.hash,commitment:row.commitment});if(receipt.outcome!=="created"||generation!==this.#generation||!this.#ready||!this.deploymentReady())throw new Error();return true;}catch{this.pause();return false;}
 }
}
