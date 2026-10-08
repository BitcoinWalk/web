import {z} from "zod";
import {RUSTRESS_WALLET_REQUIREMENTS} from "./contract";

const reference=z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const timestamp=z.number().int().safe().nonnegative();
const methods=z.array(z.string().min(1).max(64)).max(32);
const evidenceSchema=z.object({
  // Internal inventory references, never NWC keys/URLs, tokens or node identities.
  connectionRef:reference, checkoutConnectionRef:reference,
  network:z.enum(["mainnet","testnet","signet","regtest"]),
  inventory:z.object({
    checkedAt:timestamp, expiresAt:timestamp,
    // These fields must come from authenticated Hub app inventory, NOT get_info.
    grantedMethods:methods, notificationsGranted:z.boolean(),
    revoked:z.boolean(),
    budgetMsat:z.number().int().safe().positive(),
    remainingBudgetMsat:z.number().int().safe().nonnegative(),
    budgetRenewal:z.enum(["never","daily","weekly","monthly","yearly"]),
    isolated:z.boolean(),
  }).strict(),
  protocol:z.object({
    checkedAt:timestamp, advertisedMethods:methods,
    // Successful read-only calls through this exact connection, not another app.
    successfulReadMethods:methods,
  }).strict(),
  policy:z.object({
    approvedAt:timestamp, expiresAt:timestamp,
    expectedNetwork:z.enum(["mainnet","testnet","signet","regtest"]),
    maximumBudgetMsat:z.number().int().safe().positive(),
    maximumTestPaymentMsat:z.number().int().safe().positive(),
    maximumFeeMsat:z.number().int().safe().nonnegative(),
    feeLimitVerified:z.boolean(),
    approvedSharedWallet:z.boolean(),
  }).strict(),
}).strict();

export type WalletReadinessEvidence=z.infer<typeof evidenceSchema>;
export type WalletReadinessIssue=
  | "invalid-evidence" | "checkout-connection-reused" | "stale-evidence"
  | "network-mismatch" | "connection-revoked" | "missing-grants"
  | "excessive-grants" | "notifications-not-granted" | "missing-advertised-methods"
  | "read-probes-incomplete" | "budget-exceeds-approval" | "budget-inconsistent"
  | "renewing-budget" | "insufficient-budget" | "fee-limit-unverified"
  | "shared-wallet-not-approved";
export type WalletReadiness={
  state:"blocked"|"ready-for-authorized-test";
  issues:WalletReadinessIssue[];
  // Even complete metadata cannot prove actual sending/settlement/recovery.
  livePaymentsEnabled:false;
};
const READ_METHODS=["get_info","lookup_invoice","list_transactions"] as const;
const ALLOWED_METHODS=new Set<string>([...RUSTRESS_WALLET_REQUIREMENTS.methods,"get_balance","notifications"]);
const MAX_AGE_SECONDS=900;

/** Pure private preflight. Not wired to issuance or a wallet RPC. The eventual
 * collector must bind all evidence to the same authenticated connection and
 * obtain policy from trusted server-side approval, never browser JSON.
 * get_info advertising pay_invoice is NOT proof of an app permission. */
export function assessRustressWallet(input:unknown,now=Math.floor(Date.now()/1000)):WalletReadiness {
  const parsed=evidenceSchema.safeParse(input);
  const blocked=(issues:WalletReadinessIssue[]):WalletReadiness=>({state:"blocked",issues,livePaymentsEnabled:false});
  if(!parsed.success||!Number.isSafeInteger(now)||now<0)return blocked(["invalid-evidence"]);
  const e=parsed.data,issues:WalletReadinessIssue[]=[];
  if(e.connectionRef===e.checkoutConnectionRef)issues.push("checkout-connection-reused");
  if(e.inventory.checkedAt>now||e.protocol.checkedAt>now||e.policy.approvedAt>now||
    now-e.inventory.checkedAt>MAX_AGE_SECONDS||now-e.protocol.checkedAt>MAX_AGE_SECONDS||
    e.inventory.expiresAt<=now||e.policy.expiresAt<=now)issues.push("stale-evidence");
  if(e.network!==e.policy.expectedNetwork)issues.push("network-mismatch");
  if(e.inventory.revoked)issues.push("connection-revoked");
  if(!RUSTRESS_WALLET_REQUIREMENTS.methods.every(m=>e.inventory.grantedMethods.includes(m)))issues.push("missing-grants");
  if(e.inventory.grantedMethods.some(m=>!ALLOWED_METHODS.has(m)))issues.push("excessive-grants");
  if(!e.inventory.notificationsGranted)issues.push("notifications-not-granted");
  if(!RUSTRESS_WALLET_REQUIREMENTS.methods.every(m=>e.protocol.advertisedMethods.includes(m)))issues.push("missing-advertised-methods");
  if(!READ_METHODS.every(m=>e.protocol.successfulReadMethods.includes(m)))issues.push("read-probes-incomplete");
  if(e.inventory.budgetMsat>e.policy.maximumBudgetMsat)issues.push("budget-exceeds-approval");
  if(e.inventory.remainingBudgetMsat>e.inventory.budgetMsat)issues.push("budget-inconsistent");
  // The first manual pilot must not silently replenish its spending allowance.
  if(e.inventory.budgetRenewal!=="never")issues.push("renewing-budget");
  if(BigInt(e.inventory.remainingBudgetMsat)<BigInt(e.policy.maximumTestPaymentMsat)+BigInt(e.policy.maximumFeeMsat))issues.push("insufficient-budget");
  if(!e.policy.feeLimitVerified)issues.push("fee-limit-unverified");
  if(!e.inventory.isolated&&!e.policy.approvedSharedWallet)issues.push("shared-wallet-not-approved");
  return issues.length?blocked(issues):{state:"ready-for-authorized-test",issues:[],livePaymentsEnabled:false};
}
