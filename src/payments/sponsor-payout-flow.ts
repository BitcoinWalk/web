import {z} from "zod";
import type {PayoutDestinationVersion} from "./payout-destination-store";
import {SponsorPayoutSender,type SponsorHostObligation,type SponsorPayoutAuthorization,type SponsorPayoutStatus,type SponsorPayoutStore} from "./sponsor-payout-sender";
import {assessSponsorWallet,type SponsorWalletReadinessEvidence} from "./sponsor-wallet-readiness";
import type {PayoutWallet} from "../rustress/payout-worker";
import type {OutgoingTerms,validateOutgoingInvoice} from "../rustress/outgoing-invoice";

const money=z.string().regex(/^(0|[1-9][0-9]{0,15})$/).refine(value=>BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)),positive=money.refine(value=>BigInt(value)>0n);
const policySchema=z.object({binding:z.string().regex(/^[0-9a-f]{64}$/),walletRef:z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),journalServiceId:z.uuid(),budgetMsat:positive,acceptedPriorSpentMsat:money,maximumPayoutMsat:positive,maximumFeeMsat:money,cityIds:z.array(z.uuid()).min(1).max(100),expiresAt:z.number().int().safe().positive()}).strict();
export type SponsorPayoutPolicy=z.infer<typeof policySchema>;
type Wallet=PayoutWallet&{binding:string};
type Retrieved=ReturnType<typeof validateOutgoingInvoice>;
type Dependencies={wallet:Wallet;destinations:{version:(cityId:string,version:number)=>PayoutDestinationVersion|null};evidence:()=>Promise<{binding:string;readiness:SponsorWalletReadinessEvidence}>;authorize:(input:SponsorPayoutAuthorization)=>Promise<boolean>;recovery:{readonly binding:string;readonly serviceId:string;readonly ready:boolean;claim:(id:string)=>boolean|Promise<boolean>};retrieve?:(destination:string,amountMsat:string,network:OutgoingTerms["network"])=>Promise<Retrieved>};

/** Disabled-by-default composition boundary for the dedicated sponsorship rail.
 * No credentials, listener, scheduler or environment defaults exist here. */
export class SponsorPayoutFlow{
 #policy:SponsorPayoutPolicy;#sender:SponsorPayoutSender;
 constructor(private store:SponsorPayoutStore,private deps:Dependencies,policy:SponsorPayoutPolicy,private now=()=>Math.floor(Date.now()/1000)){
  this.#policy=policySchema.parse(policy);if(BigInt(this.#policy.acceptedPriorSpentMsat)>BigInt(this.#policy.budgetMsat)||deps.wallet.walletRef!==this.#policy.walletRef||deps.wallet.binding!==this.#policy.binding||deps.recovery.binding!==this.#policy.binding||deps.recovery.serviceId!==this.#policy.journalServiceId)throw new Error("Sponsor payout policy mismatch");
  const cities=new Set(this.#policy.cityIds);if(cities.size!==this.#policy.cityIds.length)throw new Error("Duplicate sponsor payout city");
  this.#sender=new SponsorPayoutSender(store,deps.destinations,deps.wallet,input=>this.authorize(input),obligation=>this.feeCap(obligation),{now,retrieve:deps.retrieve,claim:id=>this.claim(id)});
 }
 private feeCap(obligation:SponsorHostObligation){const native=(BigInt(obligation.hostMsat)+99n)/100n,fee=native>10000n?native:10000n;if(fee>BigInt(this.#policy.maximumFeeMsat))throw new Error("Sponsor payout fee policy unavailable");return String(fee);}
 private async authorize(input:SponsorPayoutAuthorization){
  const policy=this.#policy;if(this.now()>=policy.expiresAt||input.walletRef!==policy.walletRef||!policy.cityIds.includes(input.obligation.cityId)||BigInt(input.amountMsat)>BigInt(policy.maximumPayoutMsat)||BigInt(input.maximumFeeMsat)>BigInt(policy.maximumFeeMsat))return false;
  const evidence=await this.deps.evidence(),readiness=evidence.readiness;if(evidence.binding!==policy.binding||readiness.connectionRef!==policy.walletRef||assessSponsorWallet(readiness,this.now()).state!=="ready-for-authorized-test")return false;
  const network={mainnet:"bc",testnet:"tb",signet:"tb",regtest:"bcrt"}[readiness.network];
  return network===this.deps.wallet.network&&BigInt(readiness.policy.maximumPayoutMsat)>=BigInt(input.amountMsat)&&BigInt(readiness.policy.maximumFeeMsat)>=BigInt(input.maximumFeeMsat)&&BigInt(readiness.policy.maximumBudgetMsat)>=BigInt(policy.budgetMsat)&&await this.deps.authorize(input);
 }
 private async claim(id:string){
  const policy=this.#policy,available=BigInt(policy.budgetMsat)-BigInt(policy.acceptedPriorSpentMsat);
  return this.now()<policy.expiresAt&&this.deps.recovery.ready&&this.store.claimWithinBudget(id,policy.walletRef,String(available))&&await this.deps.recovery.claim(id)&&this.now()<policy.expiresAt&&this.deps.recovery.ready;
 }
 process(orderId:string):Promise<SponsorPayoutStatus|null>{return this.#sender.process(orderId);}
 run(limit=20){return this.#sender.run(limit);}
}
