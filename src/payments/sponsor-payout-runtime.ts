import {z} from "zod";
import {SponsorPayoutFlow} from "./sponsor-payout-flow";
import {SponsorPayoutRecovery} from "./sponsor-payout-recovery";
import {verifySponsorPayoutOperation,type SponsorPayoutOperationExpected,type SponsorPayoutOrderScope} from "./sponsor-payout-operation";
import {assessSponsorWallet,type SponsorWalletReadinessEvidence} from "./sponsor-wallet-readiness";
import {requireSponsorPayoutOrder} from "./sponsor-payout-order";
import type {SponsorPayoutStore} from "./sponsor-payout-sender";
import {RustressNwcWallet,type WalletSendPermit} from "../rustress/nwc-wallet";
import {RustressNwcReader} from "../rustress/nwc-reader";
import {RemoteJournalClient} from "../rustress/remote-journal-client";
import {createRecoveryHistory,type RecoveryCoverage} from "../rustress/recovery-history";
import {requireHubPaymentSafetyCapability} from "../rustress/hub-capability";
import type {PayoutWallet} from "../rustress/payout-worker";

type Expected=SponsorPayoutOperationExpected&{order:SponsorPayoutOrderScope};
type PermitRequest=Parameters<NonNullable<ConstructorParameters<typeof RustressNwcWallet>[4]>>[0];
type Connections={reader:Pick<RustressNwcReader,"binding"|"getInfo"|"listRecoveryTransactions">;wallet:PayoutWallet&{binding:string};journal:Pick<RemoteJournalClient,"binding"|"serviceId"|"status"|"page"|"claim">};
const deploymentSchema=z.object({binding:z.string(),serviceId:z.uuid(),checkedAt:z.number().int(),expiresAt:z.number().int(),privateTransport:z.literal(true),separateHost:z.literal(true),backupRestoreVerified:z.literal(true),exclusiveSender:z.literal(true)}).strict();
export type SponsorPayoutRuntimeDependencies={
 store:SponsorPayoutStore;expected:Expected;operation:()=>unknown;
 evidence:()=>Promise<{binding:string;readiness:SponsorWalletReadinessEvidence}>;
 deployment:()=>Promise<z.infer<typeof deploymentSchema>>;coverage:()=>Promise<RecoveryCoverage>;
 connect:(permit:(request:PermitRequest)=>Promise<WalletSendPermit|null>,enabled:()=>boolean)=>Promise<Connections>;
 retrieve?:ConstructorParameters<typeof SponsorPayoutFlow>[1]["retrieve"];
};

/** Concrete NWC and journal adapters. Only the payout secret is loaded;
 * checkout and zap identities are public separation pins, not credentials. */
export function sponsorPayoutConnections(input:{walletRef:string;wallet:string;checkoutClientPubkey:string;zapClientPubkey:string;journalOrigin:string;journalToken:string;serviceId:string;binding:string},permit:(request:PermitRequest)=>Promise<WalletSendPermit|null>,enabled:()=>boolean):Connections{
 const reader=new RustressNwcReader(input.walletRef,input.wallet,{clientPubkey:input.checkoutClientPubkey});
 const separation=new RustressNwcReader(input.walletRef,input.wallet,{clientPubkey:input.zapClientPubkey});
 if(reader.binding!==input.binding||separation.binding!==input.binding)throw new Error("Sponsor wallet binding unavailable");
 return {reader,wallet:new RustressNwcWallet(input.walletRef,input.wallet,{clientPubkey:input.checkoutClientPubkey},"bc",permit,enabled),journal:new RemoteJournalClient(input.journalOrigin,input.journalToken,input.serviceId,input.binding)};
}

/** Serialized, one-order staging runner. No listener, scheduler, funding,
 * checkout invoice creation or journal activation. All outputs are redacted. */
export class SponsorPayoutRuntime{
 #busy=false;#generation=0;#ready=false;#sending=false;#recovery?:SponsorPayoutRecovery;
 #blockedAt="approval";#deployment?:z.infer<typeof deploymentSchema>;
 constructor(private deps:SponsorPayoutRuntimeDependencies,private enabled:()=>boolean=()=>false,private now=()=>Math.floor(Date.now()/1000)){
  if(deps.expected.cityIds.length!==1||!deps.expected.order)throw new Error("One exact sponsor order required");
 }
 get blockedAt(){return this.#blockedAt;}
 pause(){this.#generation++;this.#ready=false;this.#sending=false;this.#recovery?.pause();}
 private grant(){return verifySponsorPayoutOperation(this.deps.operation(),this.deps.expected,this.now());}
 private active(){try{this.grant();return this.enabled();}catch{return false;}}
 private deployed(){const d=this.#deployment,t=this.now();return !!d&&d.binding===this.deps.expected.binding&&d.serviceId===this.deps.expected.journalServiceId&&d.checkedAt<=t&&t-d.checkedAt<=60&&d.expiresAt>t;}
 private order(){return requireSponsorPayoutOrder(this.deps.store.db,this.deps.expected.order,this.deps.expected.cityIds[0]);}
 private async evidence(connections:Connections){
  this.#deployment=deploymentSchema.parse(await this.deps.deployment());
  if(!this.active()||!this.deployed())throw new Error();
  const evidence=await this.deps.evidence();
  if(evidence.binding!==this.deps.expected.binding||evidence.readiness.connectionRef!==this.deps.expected.walletRef||evidence.readiness.network!=="mainnet"||assessSponsorWallet(evidence.readiness,this.now()).state!=="ready-for-authorized-test")throw new Error();
  const info=await connections.reader.getInfo();requireHubPaymentSafetyCapability(info);
  const protocol=z.object({network:z.literal("mainnet"),methods:z.array(z.string())}).passthrough().parse(info);
  if(!["get_info","lookup_invoice","list_transactions","pay_invoice"].every(method=>protocol.methods.includes(method)))throw new Error();
  if(!this.active()||!this.deployed())throw new Error();return evidence;
 }
 async execute(send=false){
  if(this.#busy)return {state:"busy" as const};this.#busy=true;this.pause();const generation=this.#generation;
  try{
   this.#blockedAt="approval";const grant=this.grant();if(!this.active())throw new Error();
   this.#blockedAt="settled-order";const order=this.order();
   if(BigInt(order.obligation.hostMsat)>BigInt(grant.maximumPayoutMsat))throw new Error();
   const current=()=>this.active()&&this.deployed()&&generation===this.#generation;
   const canSend=()=>current()&&this.#sending&&this.#ready&&this.#recovery?.ready===true;
   const permit=async(request:PermitRequest):Promise<WalletSendPermit|null>=>{
    try{
     if(!canSend())throw new Error();await this.evidence(connections);const latest=this.order(),attempt=this.deps.store.active(grant.order!.orderId);
     const amount=BigInt(request.amountMsat),fee=(amount+99n)/100n>10000n?(amount+99n)/100n:10000n;
     if(!canSend()||request.binding!==grant.binding||!attempt||attempt.state!=="unknown"||attempt.paymentHash!==request.paymentHash||attempt.amountMsat!==request.amountMsat||latest.obligation.hostMsat!==request.amountMsat||
      fee>BigInt(request.maximumFeeMsat)||fee>BigInt(grant.maximumFeeMsat)||fee>BigInt(latest.obligation.retainedMsat))throw new Error();
     const t=this.now();return {binding:grant.binding,paymentHash:request.paymentHash,amountMsat:request.amountMsat,enforcedFeeCeilingMsat:String(fee),checkedAt:t,expiresAt:Math.min(t+30,grant.expiresAt),authorized:true};
    }catch{return null;}
   };
   this.#blockedAt="wallet-connection";const connections=await this.deps.connect(permit,canSend);
   if(connections.reader.binding!==grant.binding||connections.wallet.binding!==grant.binding||connections.wallet.walletRef!==grant.walletRef||connections.wallet.network!=="bc"||connections.journal.binding!==grant.binding||connections.journal.serviceId!==grant.journalServiceId)throw new Error();
   this.#blockedAt="wallet-evidence";await this.evidence(connections);
   if(!current())throw new Error();
   const coverage=async()=>{const c=await this.deps.coverage(),state=await connections.journal.status();if(c.acceptedPriorSpends.length!==0||!state.active||c.fenceId!==state.fence)throw new Error();return c;};
   const history=createRecoveryHistory(connections.reader,coverage,this.now);
   const recovery=new SponsorPayoutRecovery(connections.journal,this.deps.store,grant.walletRef,history,hash=>connections.wallet.lookup(hash),current);this.#recovery=recovery;
   this.#blockedAt="history-recovery";if((await recovery.reconcile()).state!=="reconciled"||!current())throw new Error();
   this.#ready=true;this.#blockedAt="none";
   if(!send)return {state:"ready" as const,paymentSent:false as const,status:this.deps.store.status(grant.order!.orderId)};
   this.#sending=true;this.#blockedAt="payout";
   const flow=new SponsorPayoutFlow(this.deps.store,{wallet:connections.wallet,destinations:{version:()=>this.order().destination},evidence:()=>this.evidence(connections),authorize:async input=>canSend()&&input.obligation.orderId===grant.order!.orderId&&this.order().obligation.hostMsat===input.amountMsat,recovery,retrieve:this.deps.retrieve},
    {binding:grant.binding,walletRef:grant.walletRef,journalServiceId:grant.journalServiceId,budgetMsat:grant.budgetMsat,acceptedPriorSpentMsat:"0",maximumPayoutMsat:grant.maximumPayoutMsat,maximumFeeMsat:grant.maximumFeeMsat,cityIds:grant.cityIds,expiresAt:grant.expiresAt},this.now);
   const status=await flow.process(grant.order!.orderId);
   if(status?.state==="paid"&&!status.feeLimitExceeded){this.#blockedAt="none";return {state:"paid" as const,status};}
   return {state:"blocked" as const,blockedAt:this.#blockedAt,status};
  }catch{return {state:"blocked" as const,blockedAt:this.#blockedAt};}
  finally{this.pause();this.#busy=false;}
 }
}
