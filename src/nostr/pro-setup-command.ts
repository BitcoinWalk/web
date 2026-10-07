import {getEventHash, verifyEvent, type Event, type EventTemplate} from "nostr-tools";
import {z} from "zod";

const commandSchema = z.discriminatedUnion("action", [
  z.object({action: z.literal("preview"), cityId: z.uuid()}).strict(),
  z.object({action: z.literal("save-payout"), cityId: z.uuid(), destination: z.string().trim().min(5).max(500)}).strict(),
]);
export type ProSetupCommand = z.infer<typeof commandSchema>;
export function proSetupTemplate(command: ProSetupCommand, origin: string, now = Math.floor(Date.now() / 1000)): EventTemplate {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin) throw new Error("A canonical HTTPS origin is required.");
  return {kind: 27235, created_at: now, tags: [["u", `${origin}/api/pro-setup`], ["method", "POST"], ["t", "bitcoinwalk-pro-setup-v1"]],
    content: JSON.stringify(commandSchema.parse(command))};
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
