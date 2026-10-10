import {z} from "zod";
import type {PayoutLedger} from "./payout-ledger";
import type {PayoutDeploymentEvidence} from "./payout-runtime";
import type {RecoveryCoverage} from "./recovery-history";
import type {WalletReadinessEvidence} from "./wallet-readiness";
import {NATIVE_HUB_SAFETY_CONTRACT,type NativeHubSafetyEvidence} from "./hub-capability";
import type {WalletSendPermit} from "./nwc-wallet";

export const PAYOUT_HOST_EVIDENCE_CONTRACT="bitcoinwalk-payout-host-evidence-v1";
const hex=z.string().regex(/^[0-9a-f]{64}$/),money=z.string().regex(/^[1-9][0-9]{0,15}$/);
const acceptedSpend=z.object({paymentHash:hex,amountMsat:money,feeMsat:z.string().regex(/^(0|[1-9][0-9]{0,15})$/),
 createdAt:z.number().int().safe().nonnegative(),settledAt:z.number().int().safe().nonnegative()}).strict();
const configSchema=z.object({contract:z.literal(PAYOUT_HOST_EVIDENCE_CONTRACT),release:z.string().regex(/^0\.[0-9]+\.[0-9]+$/),
 binding:hex,journalServiceId:z.uuid(),walletRef:z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),checkoutConnectionRef:z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
 connectionStartedAt:z.number().int().safe().positive(),retainedFrom:z.number().int().safe().positive(),approvedAt:z.number().int().safe().positive(),expiresAt:z.number().int().safe().positive(),
 budgetMsat:money,maximumPayoutMsat:money,maximumFeeMsat:money,grantedMethods:z.array(z.string()).max(16),notificationsGranted:z.literal(true),
 isolated:z.literal(true),exclusiveConnection:z.literal(true),inventoryVerified:z.literal(true),separateHost:z.literal(true),privateTransport:z.literal(true),
 backupRestoreVerified:z.literal(true),hubVersion:z.literal("1.24.0"),backend:z.literal("ldk"),feePolicy:z.literal("ldk-native-v1"),
 acceptedPriorSpends:z.array(acceptedSpend).max(16)}).strict();
export type PayoutHostEvidenceConfig=z.infer<typeof configSchema>;
type JournalState={serviceId:string;binding:string;fence:string|null;active:boolean;lastSequence:number};
type PermitRequest={binding:string;paymentHash:string;amountMsat:string;maximumFeeMsat:string};

/** Fresh evidence derived from fixed owner-only host inventory, current ledger
 * reservations and the live independent journal fence. Browser input is never
 * accepted. */
export class PayoutHostEvidence{
 readonly config:PayoutHostEvidenceConfig;
 constructor(input:unknown,private ledger:PayoutLedger,private journal:()=>Promise<JournalState>,private enabled:()=>boolean=()=>false,private now=()=>Math.floor(Date.now()/1000)){
  this.config=configSchema.parse(input);
  if(this.config.walletRef===this.config.checkoutConnectionRef||this.config.retainedFrom>this.config.connectionStartedAt)throw new Error("Invalid payout host evidence");
 }
 private time(){const now=this.now();if(now<this.config.connectionStartedAt||now>=this.config.expiresAt)throw new Error("Payout host evidence expired");return now;}
 async deployment():Promise<PayoutDeploymentEvidence>{
  const now=this.time(),journal=await this.journal();
  if(journal.serviceId!==this.config.journalServiceId||journal.binding!==this.config.binding)throw new Error("Journal deployment mismatch");
  return {binding:this.config.binding,serviceId:this.config.journalServiceId,checkedAt:now,expiresAt:Math.min(now+60,this.config.expiresAt),privateTransport:true,separateHost:true,backupRestoreVerified:true,exclusiveSender:true};
 }
 evidence():{binding:string;readiness:WalletReadinessEvidence}{
  const now=this.time(),usage=this.ledger.budgetUsage(this.config.walletRef),prior=this.config.acceptedPriorSpends.reduce((sum,row)=>sum+BigInt(row.amountMsat)+BigInt(row.feeMsat),0n),
   remaining=BigInt(this.config.budgetMsat)-prior-BigInt(usage.usedMsat);
  const fee=BigInt(this.config.maximumFeeMsat),configuredMaximum=BigInt(this.config.maximumPayoutMsat),effectiveMaximum=remaining>fee?(remaining-fee<configuredMaximum?remaining-fee:configuredMaximum):0n;
  if(remaining<0n||remaining>BigInt(Number.MAX_SAFE_INTEGER)||effectiveMaximum<1000n||effectiveMaximum>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Wallet budget evidence unavailable");
  const readiness:WalletReadinessEvidence={connectionRef:this.config.walletRef,checkoutConnectionRef:this.config.checkoutConnectionRef,network:"mainnet",
   inventory:{checkedAt:now,expiresAt:Math.min(now+60,this.config.expiresAt),grantedMethods:this.config.grantedMethods,notificationsGranted:true,revoked:false,
    budgetMsat:Number(this.config.budgetMsat),remainingBudgetMsat:Number(remaining),budgetRenewal:"never",isolated:true},
   protocol:{checkedAt:now,advertisedMethods:this.config.grantedMethods,successfulReadMethods:["get_info","lookup_invoice","list_transactions"]},
   policy:{approvedAt:this.config.approvedAt,expiresAt:this.config.expiresAt,expectedNetwork:"mainnet",maximumBudgetMsat:Number(this.config.budgetMsat),
    maximumTestPaymentMsat:Number(effectiveMaximum),maximumFeeMsat:Number(this.config.maximumFeeMsat),feeLimitVerified:true,approvedSharedWallet:false}};
  return {binding:this.config.binding,readiness};
 }
 hubSafety():NativeHubSafetyEvidence{
  const now=this.time();return {contract:NATIVE_HUB_SAFETY_CONTRACT,binding:this.config.binding,checkedAt:now,expiresAt:Math.min(now+60,this.config.expiresAt),
   hubVersion:"1.24.0",backend:"ldk",feePolicy:"ldk-native-v1",nonRenewingBudgetMsat:this.config.budgetMsat,exclusiveConnection:true,inventoryVerified:true};
 }
 async coverage():Promise<RecoveryCoverage>{
  const now=this.time(),journal=await this.journal();
  if(journal.serviceId!==this.config.journalServiceId||journal.binding!==this.config.binding||!journal.active||!journal.fence)throw new Error("Journal fence unavailable");
  return {binding:this.config.binding,fenceId:journal.fence,connectionStartedAt:this.config.connectionStartedAt,retainedFrom:this.config.retainedFrom,
   checkedAt:now,expiresAt:Math.min(now+60,this.config.expiresAt),exclusive:true,sendersStopped:true,
   acceptedPriorSpends:this.config.acceptedPriorSpends};
 }
 async permit(request:PermitRequest):Promise<WalletSendPermit|null>{
  try{
   const now=this.time();if(!this.enabled()||request.binding!==this.config.binding||!/^[0-9a-f]{64}$/.test(request.paymentHash))throw new Error();
   const amount=BigInt(request.amountMsat),requested=BigInt(request.maximumFeeMsat),native=(amount+99n)/100n,ceiling=native>10000n?native:10000n;
   if(amount<=0n||amount>BigInt(this.config.maximumPayoutMsat)||ceiling>requested||ceiling>BigInt(this.config.maximumFeeMsat))throw new Error();
   return {binding:this.config.binding,paymentHash:request.paymentHash,amountMsat:request.amountMsat,enforcedFeeCeilingMsat:String(ceiling),checkedAt:now,expiresAt:Math.min(now+30,this.config.expiresAt),authorized:true};
  }catch{return null;}
 }
 policy(){const acceptedPriorSpentMsat=String(this.config.acceptedPriorSpends.reduce((sum,row)=>sum+BigInt(row.amountMsat)+BigInt(row.feeMsat),0n));
  return {binding:this.config.binding,budgetMsat:this.config.budgetMsat,acceptedPriorSpentMsat,maximumPayoutMsat:this.config.maximumPayoutMsat,
  maximumFeeMsat:this.config.maximumFeeMsat,feePolicy:"ldk-native-v1" as const,expiresAt:this.config.expiresAt};}
}
