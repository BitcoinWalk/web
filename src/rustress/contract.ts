import {createHash} from "node:crypto";
import {z} from "zod";

export const RUSTRESS_REVIEWED_COMMIT = "c72fdeccd80025d181efc1b1d45baeb8bfbde4a9";
export const RUSTRESS_API = "bitcoinwalk-provisioning-v1";
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const label = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(63);
const domain = z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/).max(253);

/** Private server-to-server configuration. It contains no wallet credential.
 * Input must be assembled from freshly verified owner/brand/entitlement evidence,
 * not copied from a browser. LNURL endpoint validation belongs to BW-101. */
const configFields = {
  cityId: z.uuid(), version, domain, localPart: label, brandPubkey: hex,
  authorityEventId: hex, approvalEventId: hex, brandEventId: hex,
  payoutVersion: version,
  payoutDestination: z.string().min(3).max(500).refine(value =>
    /^[A-Za-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(value) || /^lnurl1[02-9ac-hj-np-z]+$/.test(value)),
  walletRef: label,
  organizerBasisPoints: z.literal(7900), retainedBasisPoints: z.literal(2100),
} as const;
const rejectCircular = (value: {payoutDestination:string;localPart:string;domain:string}, ctx: z.RefinementCtx) => {
  if (value.payoutDestination.toLowerCase() === `${value.localPart}@${value.domain}`)
    ctx.addIssue({code: "custom", message: "Circular city payout destination"});
};
/** Fixture/app workflow remains incapable of enabling invoice issuance. */
export const provisionConfigSchema = z.object({...configFields, invoiceIssuance:z.literal("disabled")}).strict().superRefine(rejectCircular);
/** Private payout authority accepts enabled only at the later managed boundary. */
export const managedProvisionConfigSchema = z.object({...configFields, invoiceIssuance:z.enum(["disabled","enabled"])}).strict().superRefine(rejectCircular);
export type ProvisionConfig = z.infer<typeof managedProvisionConfigSchema>;

export function provisionDigest(value: ProvisionConfig): string {
  return createHash("sha256").update(JSON.stringify(managedProvisionConfigSchema.parse(value))).digest("hex");
}

export const capabilitiesSchema = z.object({
  api: z.literal(RUSTRESS_API), upstreamCommit: z.literal(RUSTRESS_REVIEWED_COMMIT),
  adapterRevision: hex, domain,
  atomicConfiguration: z.literal(true), managedEntriesOnly: z.literal(true),
  compareAndSwap: z.literal(true), idempotency: z.literal(true),
  invoiceIssuanceGate: z.literal(true),
}).strict();

export const provisionReceiptSchema = z.object({
  api: z.literal(RUSTRESS_API), cityId: z.uuid(), version,
  configHash: hex, state: z.enum(["prepared", "applied"]),
  invoiceIssuance: z.literal("disabled"),
}).strict();
export type ProvisionReceipt = z.infer<typeof provisionReceiptSchema>;
export const activationReceiptSchema = z.object({
  api: z.literal(RUSTRESS_API), cityId: z.uuid(), version,
  configHash: hex, state: z.enum(["prepared", "applied"]),
  invoiceIssuance: z.literal("enabled"),
}).strict();
export type ActivationReceipt = z.infer<typeof activationReceiptSchema>;

/** Contract only; self-reported methods are not proof of a granted wallet scope.
 * A separate isolated-wallet rehearsal must verify permissions before activation. */
export const RUSTRESS_WALLET_REQUIREMENTS = {
  methods: ["get_info", "make_invoice", "lookup_invoice", "list_transactions", "pay_invoice"],
  notifications: ["payment_received"],
  requiresSeparateConnection: true, requiresBudget: true,
  liveSpendingEnabled: false,
} as const;
