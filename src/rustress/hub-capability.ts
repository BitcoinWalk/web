import {z} from "zod";

export const HUB_PAYMENT_SAFETY_CONTRACT="bitcoinwalk-payment-safety-v1";
export const HUB_PAYMENT_SAFETY_CANDIDATE="6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84";
export const HUB_PAYMENT_SAFETY_UPSTREAM="a231ed34a660cd86c0bd7f36282f7eb0dc90223f";

const capability=z.object({
 contract:z.literal(HUB_PAYMENT_SAFETY_CONTRACT),
 candidate_revision:z.literal(HUB_PAYMENT_SAFETY_CANDIDATE),
 upstream_commit:z.literal(HUB_PAYMENT_SAFETY_UPSTREAM),
 backend:z.literal("ldk"),
 explicit_fee_ceiling:z.literal(true),
 unknown_outcome_reservation:z.literal(true),
 outgoing_lookup_reconciliation:z.literal(true),
 legacy_failed_quarantine:z.literal(true),
}).strict();

const getInfo=z.object({bitcoinwalk_payment_safety:capability}).passthrough();
export type HubPaymentSafetyCapability=z.infer<typeof capability>;
export const NATIVE_HUB_SAFETY_CONTRACT="bitcoinwalk-native-hub-safety-v1";
const money=z.string().regex(/^[1-9][0-9]{0,15}$/);
const nativeEvidence=z.object({contract:z.literal(NATIVE_HUB_SAFETY_CONTRACT),binding:z.string().regex(/^[0-9a-f]{64}$/),
 checkedAt:z.number().int().safe().positive(),expiresAt:z.number().int().safe().positive(),hubVersion:z.literal("1.24.0"),backend:z.literal("ldk"),
 feePolicy:z.literal("ldk-native-v1"),nonRenewingBudgetMsat:money,exclusiveConnection:z.literal(true),inventoryVerified:z.literal(true)}).strict();
export type NativeHubSafetyEvidence=z.infer<typeof nativeEvidence>;

/** Accept only the authenticated get_info statement emitted by the exact
 * reviewed Hub/LDK candidate. Generic NIP-47 methods, deployment labels and
 * operator assertions are intentionally insufficient. */
export function requireHubPaymentSafetyCapability(value:unknown):HubPaymentSafetyCapability{
 return getInfo.parse(value).bitcoinwalk_payment_safety;
}

/** Production alternative approved for the existing Hub. Generic NWC method
 * advertising is insufficient: exact fresh host inventory must bind version,
 * backend, connection fingerprint and the non-renewing app budget. */
export function requireRuntimeHubSafety(value:unknown,evidence:unknown,expected:{binding:string;budgetMsat:string},now:number){
 try{return {mode:"candidate" as const,capability:requireHubPaymentSafetyCapability(value)};}catch{}
 const info=z.object({network:z.literal("mainnet"),methods:z.array(z.string()).max(32)}).passthrough().parse(value),proof=nativeEvidence.parse(evidence);
 const required=["get_info","make_invoice","lookup_invoice","list_transactions","pay_invoice"];
 if(required.some(method=>!info.methods.includes(method))||proof.binding!==expected.binding||proof.nonRenewingBudgetMsat!==expected.budgetMsat||
  proof.checkedAt>now||now-proof.checkedAt>60||proof.expiresAt<=now)throw new Error("Hub payment safety unavailable");
 return {mode:"native" as const,evidence:proof};
}
