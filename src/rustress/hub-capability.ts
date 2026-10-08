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

/** Accept only the authenticated get_info statement emitted by the exact
 * reviewed Hub/LDK candidate. Generic NIP-47 methods, deployment labels and
 * operator assertions are intentionally insufficient. */
export function requireHubPaymentSafetyCapability(value:unknown):HubPaymentSafetyCapability{
 return getInfo.parse(value).bitcoinwalk_payment_safety;
}
