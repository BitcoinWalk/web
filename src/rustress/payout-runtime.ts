import {z} from "zod";
import {PayoutFlow} from "./payout-flow";
import {RustressNwcReader} from "./nwc-reader";
import {RustressNwcWallet,type WalletSendPermit} from "./nwc-wallet";
import {RemoteJournalClient} from "./remote-journal-client";
import {RemoteJournalRecovery} from "./remote-journal-recovery";
import {createRecoveryHistory,type RecoveryCoverage} from "./recovery-history";
import {SettlementCollector} from "./settlement-collector";
import {assessRustressWallet,type WalletReadinessEvidence} from "./wallet-readiness";
import {requireHubPaymentSafetyCapability} from "./hub-capability";
import type {PayoutLedger,IncomingSnapshot} from "./payout-ledger";

const deploymentSchema=z.object({binding:z.string(),serviceId:z.uuid(),checkedAt:z.number().int().safe(),expiresAt:z.number().int().safe(),
 privateTransport:z.literal(true),separateHost:z.literal(true),backupRestoreVerified:z.literal(true),exclusiveSender:z.literal(true)}).strict();
export type PayoutDeploymentEvidence=z.infer<typeof deploymentSchema>;
type Policy=ConstructorParameters<typeof PayoutFlow>[2];
type PermitRequest=Parameters<NonNullable<ConstructorParameters<typeof RustressNwcWallet>[4]>>[0];
export type PayoutRuntimeDependencies={
 ledger:PayoutLedger;walletRef:string;network:"bc"|"tb"|"bcrt";policy:Policy;
 journal:{origin:string;serviceId:string};
 // Explicit private providers only. No process.env defaults, browser arguments,
 // on-disk secrets or claims that metadata alone proves wallet readiness.
 credentials:()=>Promise<{wallet:string;checkout:string;journalClientToken:string}>;
 evidence:()=>Promise<{binding:string;readiness:WalletReadinessEvidence}>;
 deployment:()=>Promise<PayoutDeploymentEvidence>;
 coverage:()=>Promise<RecoveryCoverage>;
 permit:(r:PermitRequest)=>Promise<WalletSendPermit|null>;
 fetchJson:(url:URL)=>Promise<unknown>;
};

/** Server-only composition. No listeners, timer, automatic activation or journal
 * operator authority. All public operations serialize; pause invalidates work
 * in flight but cannot cancel a payment already published to the wallet. */
export class PayoutRuntime {
 #busy=false;#generation=0;#ready=false;
 #flow?:PayoutFlow;#recovery?:RemoteJournalRecovery;#collector?:SettlementCollector;
 #deployment?:PayoutDeploymentEvidence;
 constructor(private deps:PayoutRuntimeDependencies,private enabled:()=>boolean=()=>false,private now=()=>Math.floor(Date.now()/1000)){}
 pause(){this.#generation++;this.#ready=false;this.#recovery?.pause();}
 private active(){
  const d=this.#deployment,time=this.now();
  return this.enabled()&&!!d&&d.binding===this.deps.policy.binding&&d.serviceId===this.deps.journal.serviceId&&
   d.checkedAt<=time&&time-d.checkedAt<=60&&d.expiresAt>time&&this.deps.policy.expiresAt>time;
 }
 get ready(){return this.#ready&&this.active()&&this.#recovery?.ready===true;}
 async reconcile(){
  if(!this.enabled()||this.#busy)return {state:"paused" as const};
  this.#busy=true;this.pause();const generation=this.#generation;
  try{
   const d=deploymentSchema.parse(await this.deps.deployment());this.#deployment=d;
   if(!this.active()||generation!==this.#generation)throw new Error();
   const e=await this.deps.evidence();
   if(e.binding!==this.deps.policy.binding||assessRustressWallet(e.readiness,this.now()).state!=="ready-for-authorized-test")throw new Error();
   if(!this.active()||generation!==this.#generation)throw new Error();
   const c=await this.deps.credentials();
   if(!this.active()||generation!==this.#generation)throw new Error();
   const reader=new RustressNwcReader(this.deps.walletRef,c.wallet,c.checkout);
   if(reader.binding!==this.deps.policy.binding)throw new Error();
   requireHubPaymentSafetyCapability(await reader.getInfo());
   if(!this.active()||generation!==this.#generation)throw new Error();
   const wallet=new RustressNwcWallet(this.deps.walletRef,c.wallet,c.checkout,this.deps.network,this.deps.permit,()=>this.ready&&generation===this.#generation,this.now);
   if(wallet.binding!==reader.binding)throw new Error();
   const client=new RemoteJournalClient(this.deps.journal.origin,c.journalClientToken,this.deps.journal.serviceId,reader.binding);
   const history=createRecoveryHistory(reader,this.deps.coverage,this.now);
   const recovery=new RemoteJournalRecovery(client,this.deps.ledger,this.deps.walletRef,history,hash=>wallet.lookup(hash),()=>this.active()&&generation===this.#generation);
   this.#recovery=recovery;
   if((await recovery.reconcile()).state!=="reconciled"||!this.active()||generation!==this.#generation)throw new Error();
   this.#flow=new PayoutFlow(this.deps.ledger,{wallet,reader,evidence:this.deps.evidence,fetchJson:this.deps.fetchJson,recovery},this.deps.policy,this.now);
   this.#collector=new SettlementCollector(this.#flow,()=>this.ready&&generation===this.#generation);
   this.#ready=true;return {state:"reconciled" as const};
  }catch{this.pause();return {state:"blocked" as const};}finally{this.#busy=false;}
 }
 private async operation<T>(run:()=>Promise<T>){
  if(this.#busy||!this.ready)return {state:"paused" as const};
  this.#busy=true;const generation=this.#generation;
  try{
   const result=await run();
   if(generation!==this.#generation||!this.ready)return {state:"paused" as const};
   return {state:"completed" as const,result};
  }catch{this.pause();return {state:"blocked" as const};}finally{this.#busy=false;}
 }
 register(snapshot:IncomingSnapshot){return this.operation(async()=>this.#flow!.register(snapshot));}
 poll(after=0,maxPages=10){return this.operation(()=>this.#collector!.poll(after,maxPages));}
 prepare(hash:string,id:string){return this.operation(()=>this.#flow!.prepare(hash,id));}
 run(id:string){return this.operation(()=>this.#flow!.run(id));}
 hint(hash:string){return this.ready&&this.#collector?.hint(hash)===true;}
}
