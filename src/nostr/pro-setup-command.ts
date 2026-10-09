import {getEventHash, verifyEvent, type Event, type EventTemplate} from "nostr-tools";
import {z} from "zod";

const commandSchema = z.discriminatedUnion("action", [
  z.object({action: z.literal("preview"), cityId: z.uuid()}).strict(),
  z.object({action: z.literal("save-payout"), cityId: z.uuid(), destination: z.string().trim().min(5).max(500)}).strict(),
  z.object({action: z.literal("confirm-city-signer"), cityId: z.uuid(), brandPubkey: z.string().regex(/^[0-9a-f]{64}$/), backupAcknowledged: z.literal(true)}).strict(),
  z.object({action: z.literal("clear-city-signer"), cityId: z.uuid()}).strict(),
  z.object({action: z.literal("prepare-brand-request"), cityId: z.uuid()}).strict(),
  z.object({action: z.literal("submit-brand-proofs"), cityId: z.uuid(), requestId: z.uuid()}).strict(),
  z.object({action: z.literal("cancel-brand-request"), cityId: z.uuid(), requestId: z.uuid()}).strict(),
  z.object({action: z.literal("list-brand-requests")}).strict(),
  z.object({action: z.literal("review-brand-request"), requestId: z.uuid()}).strict(),
  z.object({action: z.literal("approve-brand-request"), requestId: z.uuid()}).strict(),
  z.object({action: z.literal("prepare-brand-publication"), requestId: z.uuid()}).strict(),
  z.object({action: z.literal("confirm-brand-publication"), requestId: z.uuid()}).strict(),
  z.object({action: z.literal("retry-city-provisioning"), cityId: z.uuid()}).strict(),
]);
export type ProSetupCommand = z.infer<typeof commandSchema>;
export function proSetupTemplate(command: ProSetupCommand, origin: string, now = Math.floor(Date.now() / 1000)): EventTemplate {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin) throw new Error("A canonical HTTPS origin is required.");
  return {kind: 27235, created_at: now, tags: [["u", `${origin}/api/pro-setup`], ["method", "POST"], ["t", "bitcoinwalk-pro-setup-v1"]],
    content: JSON.stringify(commandSchema.parse(command))};
}

type SignerCommand = Extract<ProSetupCommand, {action: "confirm-city-signer"}>;
export function citySignerProofTemplate(command: SignerCommand, origin: string, now = Math.floor(Date.now() / 1000)): EventTemplate {
  const parsed = commandSchema.parse(command) as SignerCommand, url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin) throw new Error("A canonical HTTPS origin is required.");
  return {kind: 27235, created_at: now, tags: [["u", `${origin}/api/pro-setup`], ["method", "POST"], ["t", "bitcoinwalk-pro-city-signer-proof-v1"], ["role", "brand"]],
    content: JSON.stringify(parsed)};
}
export function authorizeCitySignerProof(input: Event, command: SignerCommand, origin: string, now = Math.floor(Date.now() / 1000)): Event {
  const event: Event = JSON.parse(JSON.stringify(input)), template = citySignerProofTemplate(command, origin, event.created_at);
  if (!Number.isSafeInteger(event.created_at) || Math.abs(now - event.created_at) > 300 || event.pubkey !== command.brandPubkey ||
      getEventHash(event) !== event.id || !verifyEvent(event) || event.kind !== template.kind || event.content !== template.content ||
      JSON.stringify(event.tags) !== JSON.stringify(template.tags)) throw new Error("The separate city signer did not prove control of the expected identity.");
  return event;
}
export function authorizeProSetup(input: Event, origin: string, now = Math.floor(Date.now() / 1000)): ProSetupCommand {
  const event: Event = JSON.parse(JSON.stringify(input));
  const command = commandSchema.parse(JSON.parse(event.content));
  const template = proSetupTemplate(command, origin, event.created_at);
  if (!Number.isSafeInteger(event.created_at) || Math.abs(now - event.created_at) > 300 ||
      getEventHash(event) !== event.id || !verifyEvent(event) || event.kind !== template.kind ||
      JSON.stringify(event.tags) !== JSON.stringify(template.tags) || event.content !== template.content) {
    throw new Error("Valid signed Pro setup authorization required.");
  }
  return command;
}
