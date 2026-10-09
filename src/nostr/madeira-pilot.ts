import {getEventHash, verifyEvent, type Event, type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {SUPER_ADMIN_PUBKEY} from "./authority";

import {MADEIRA_PILOT} from "./madeira-pilot-policy";
export {MADEIRA_PILOT} from "./madeira-pilot-policy";
const hex = z.string().regex(/^[0-9a-f]{64}$/);
export const madeiraSnapshotSchema = z.object({revisionId: hex, approvalEventId: hex, authorityEventId: hex,
  payoutVersion: z.number().int().positive(), payoutDestination: z.string().min(3).max(500)}).strict();
export const madeiraChallengeSchema = z.object({scope: z.literal(MADEIRA_PILOT.scope), cityId: z.literal(MADEIRA_PILOT.cityId),
  pubkey: z.literal(MADEIRA_PILOT.pubkey), origin: z.literal(MADEIRA_PILOT.origin), requestId: z.uuid(),
  issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive(),
  entitlement: z.literal("staging-test-only-unpaid"), invoiceIssuance: z.literal("disabled"), snapshot: madeiraSnapshotSchema}).strict();
export type MadeiraChallenge = z.infer<typeof madeiraChallengeSchema>;
export type MadeiraSnapshot = z.infer<typeof madeiraSnapshotSchema>;
export type MadeiraRole = "owner" | "admin";
export function madeiraProofTemplate(challenge: MadeiraChallenge, role: MadeiraRole): EventTemplate {
  const checked = madeiraChallengeSchema.parse(challenge);
  return {kind: 27235, created_at: checked.issuedAt,
    tags: [["u", `${MADEIRA_PILOT.origin}/api/madeira-pilot`], ["t", MADEIRA_PILOT.scope], ["role", role]], content: JSON.stringify(checked)};
}
export function verifyMadeiraProof(input: Event, challenge: MadeiraChallenge, role: MadeiraRole, now: number, stored = false) {
  const event: Event = JSON.parse(JSON.stringify(input)), template = madeiraProofTemplate(challenge, role);
  if (challenge.expiresAt !== challenge.issuedAt + 3600 || now < challenge.issuedAt || (!stored && now >= challenge.expiresAt) ||
      event.pubkey !== (role === "owner" ? MADEIRA_PILOT.pubkey : SUPER_ADMIN_PUBKEY) ||
      event.kind !== template.kind || event.created_at !== template.created_at || event.content !== template.content ||
      JSON.stringify(event.tags) !== JSON.stringify(template.tags) || getEventHash(event) !== event.id || !verifyEvent(event))
    throw new Error("Private pilot proof is invalid or expired.");
  return event;
}
const commandSchema = z.object({action: z.enum(["load", "owner", "admin", "retry","managed-load","managed-owner","managed-admin","managed-retry"])}).strict();
export type MadeiraCommand = z.infer<typeof commandSchema>;
export function madeiraRequest(command: MadeiraCommand, now = Math.floor(Date.now() / 1000)): EventTemplate {
  return {kind:27235,created_at:now,tags:[["u",`${MADEIRA_PILOT.origin}/api/madeira-pilot`],["method","POST"],["t","madeira-pilot-request-v1"]],content:JSON.stringify(commandSchema.parse(command))};
}
export function authorizeMadeiraRequest(input: Event, now = Math.floor(Date.now() / 1000)) {
  const event: Event = JSON.parse(JSON.stringify(input));
  const command = commandSchema.parse(JSON.parse(event.content)), template = madeiraRequest(command,event.created_at);
  if (![MADEIRA_PILOT.pubkey,SUPER_ADMIN_PUBKEY].includes(event.pubkey) || !Number.isSafeInteger(event.created_at) ||
      Math.abs(now-event.created_at)>300 || event.kind!==template.kind || event.content!==template.content ||
      JSON.stringify(event.tags)!==JSON.stringify(template.tags) || getEventHash(event)!==event.id || !verifyEvent(event))
    throw new Error("Authorized pilot account signature required.");
  if((command.action==="owner"||command.action==="managed-owner") && event.pubkey!==MADEIRA_PILOT.pubkey ||
      (command.action==="admin"||command.action==="managed-admin") && event.pubkey!==SUPER_ADMIN_PUBKEY)
    throw new Error("Wrong pilot signature role.");
  return command;
}
