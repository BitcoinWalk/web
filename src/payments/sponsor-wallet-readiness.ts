import {z} from "zod";

const reference=z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),timestamp=z.number().int().safe().nonnegative(),methods=z.array(z.string().min(1).max(64)).max(16);
const schema=z.object({connectionRef:reference,checkoutConnectionRef:reference,zapConnectionRef:reference,network:z.enum(["mainnet","testnet","signet","regtest"]),
 inventory:z.object({checkedAt:timestamp,expiresAt:timestamp,grantedMethods:methods,revoked:z.boolean(),budgetMsat:z.number().int().safe().positive(),remainingBudgetMsat:z.number().int().safe().nonnegative(),budgetRenewal:z.enum(["never","daily","weekly","monthly","yearly"]),isolated:z.boolean()}).strict(),
 protocol:z.object({checkedAt:timestamp,advertisedMethods:methods,successfulReadMethods:methods}).strict(),
 policy:z.object({approvedAt:timestamp,expiresAt:timestamp,expectedNetwork:z.enum(["mainnet","testnet","signet","regtest"]),maximumBudgetMsat:z.number().int().safe().positive(),maximumPayoutMsat:z.number().int().safe().positive(),maximumFeeMsat:z.number().int().safe().nonnegative(),feeLimitVerified:z.boolean()}).strict()}).strict();
export type SponsorWalletReadinessEvidence=z.infer<typeof schema>;
export type SponsorWalletReadinessIssue="invalid-evidence"|"connection-reused"|"stale-evidence"|"network-mismatch"|"connection-revoked"|"missing-grants"|"excessive-grants"|"read-probes-incomplete"|"budget-exceeds-approval"|"budget-inconsistent"|"renewing-budget"|"insufficient-budget"|"fee-limit-unverified"|"wallet-not-isolated";
const REQUIRED=["get_info","lookup_invoice","list_transactions","pay_invoice"] as const,ALLOWED=new Set<string>([...REQUIRED,"get_balance"]),READ=["get_info","lookup_invoice","list_transactions"] as const,MAX_AGE=900;

/** Private inventory assessment for the dedicated sponsorship sender. It does
 * not accept make_invoice, notifications or a shared checkout/zap credential. */
export function assessSponsorWallet(input:unknown,now=Math.floor(Date.now()/1000)){
 const parsed=schema.safeParse(input),blocked=(issues:SponsorWalletReadinessIssue[])=>({state:"blocked" as const,issues,livePaymentsEnabled:false as const});
 if(!parsed.success||!Number.isSafeInteger(now)||now<0)return blocked(["invalid-evidence"]);const evidence=parsed.data,issues:SponsorWalletReadinessIssue[]=[];
 if(new Set([evidence.connectionRef,evidence.checkoutConnectionRef,evidence.zapConnectionRef]).size!==3)issues.push("connection-reused");
 if(evidence.inventory.checkedAt>now||evidence.protocol.checkedAt>now||evidence.policy.approvedAt>now||now-evidence.inventory.checkedAt>MAX_AGE||now-evidence.protocol.checkedAt>MAX_AGE||evidence.inventory.expiresAt<=now||evidence.policy.expiresAt<=now)issues.push("stale-evidence");
 if(evidence.network!==evidence.policy.expectedNetwork)issues.push("network-mismatch");if(evidence.inventory.revoked)issues.push("connection-revoked");
 if(!REQUIRED.every(method=>evidence.inventory.grantedMethods.includes(method))||!REQUIRED.every(method=>evidence.protocol.advertisedMethods.includes(method)))issues.push("missing-grants");
 if(evidence.inventory.grantedMethods.some(method=>!ALLOWED.has(method)))issues.push("excessive-grants");if(!READ.every(method=>evidence.protocol.successfulReadMethods.includes(method)))issues.push("read-probes-incomplete");
 if(evidence.inventory.budgetMsat>evidence.policy.maximumBudgetMsat)issues.push("budget-exceeds-approval");if(evidence.inventory.remainingBudgetMsat>evidence.inventory.budgetMsat)issues.push("budget-inconsistent");
 if(evidence.inventory.budgetRenewal!=="never")issues.push("renewing-budget");if(BigInt(evidence.inventory.remainingBudgetMsat)<BigInt(evidence.policy.maximumPayoutMsat)+BigInt(evidence.policy.maximumFeeMsat))issues.push("insufficient-budget");
 if(!evidence.policy.feeLimitVerified)issues.push("fee-limit-unverified");if(!evidence.inventory.isolated)issues.push("wallet-not-isolated");
 return issues.length?blocked(issues):{state:"ready-for-authorized-test" as const,issues:[],livePaymentsEnabled:false as const};
}
