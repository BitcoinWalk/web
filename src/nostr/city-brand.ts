import {getEventHash, verifyEvent, type Event, type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {SUPER_ADMIN_PUBKEY} from "./authority";

/** Reserved BitcoinWalk application kind; not yet admitted by deployed relays. */
export const CITY_BRAND_KIND = 30312;
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bindingSchema = z.object({
  version: z.literal(1), cityId: z.uuid(), sequence: integer,
  previous: z.union([hex, z.literal("")]),
  action: z.enum(["activate", "replace", "revoke"]), brandPubkey: hex,
}).strict();
export type CityBrandBinding = z.infer<typeof bindingSchema>;

/** Server-resolved evidence, never accepted from browser request fields.
 * Owner is the anchored directory owner, or signed creator grant when no
 * directory exists. An unavailable directory is NOT evidence of absence. */
export type CityBrandAuthority = {
  cityId: string; ownerPubkey: string; authorityEventId: string;
  approvalEventId: string; entitlementId: string; eligible: boolean;
};
const authoritySchema = z.object({
  cityId: z.uuid(), ownerPubkey: hex, authorityEventId: hex,
  approvalEventId: hex, entitlementId: z.string().min(1).max(200), eligible: z.boolean(),
}).strict();
const challengeSchema = z.object({
  version: z.literal(1), requestId: z.uuid(), origin: z.url(),
  issuedAt: integer, expiresAt: integer,
  authority: authoritySchema, binding: bindingSchema,
}).strict();
export type CityBrandChallenge = z.infer<typeof challengeSchema>;

function freshEvent(input: Event): Event {
  // Round-trip strips nostr-tools' cached verifiedSymbol; reject mutated signed objects.
  const event = JSON.parse(JSON.stringify(input)) as Event;
  if (getEventHash(event) !== event.id || !verifyEvent(event)) throw new Error("Invalid city account signature.");
  return event;
}
function canonicalOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value) throw new Error("Use a canonical HTTPS app origin.");
  return value;
}
function tags(binding: CityBrandBinding) {
  return [["d", `${binding.cityId}:${binding.sequence}`], ["i", binding.cityId], ["t", "bitcoinwalk-city-brand-v1"]];
}
export function readCityBrand(event: Event): CityBrandBinding {
  const signed = freshEvent(event);
  const binding = bindingSchema.parse(JSON.parse(signed.content));
  if (signed.pubkey !== SUPER_ADMIN_PUBKEY || signed.kind !== CITY_BRAND_KIND ||
      JSON.stringify(signed.tags) !== JSON.stringify(tags(binding)) ||
      signed.content !== JSON.stringify(binding)) throw new Error("Unapproved city account binding.");
  return binding;
}
function successor(binding: CityBrandBinding, previous: Event | null) {
  if (!previous) {
    if (binding.sequence !== 0 || binding.previous !== "" || binding.action !== "activate") throw new Error("Missing city account predecessor.");
    return;
  }
  const prior = readCityBrand(previous);
  if (binding.cityId !== prior.cityId || binding.sequence !== prior.sequence + 1 || binding.previous !== previous.id) throw new Error("Stale city account predecessor.");
  if (binding.action === "activate" || binding.action === "revoke" && (prior.action === "revoke" || binding.brandPubkey !== prior.brandPubkey) ||
      binding.action === "replace" && binding.brandPubkey === prior.brandPubkey) throw new Error("Invalid city account transition.");
}
export function createCityBrandChallenge(input: {
  requestId: string; origin: string; authority: CityBrandAuthority;
  brandPubkey: string; action: CityBrandBinding["action"]; previous: Event | null; now: number;
}): CityBrandChallenge {
  const authority = authoritySchema.parse(input.authority);
  const prior = input.previous ? readCityBrand(input.previous) : null;
  if (input.previous && input.now < input.previous.created_at) throw new Error("City account request predates its predecessor.");
  const binding = bindingSchema.parse({version: 1, cityId: authority.cityId,
    sequence: prior ? prior.sequence + 1 : 0, previous: input.previous?.id ?? "",
    action: input.action, brandPubkey: input.brandPubkey});
  successor(binding, input.previous);
  if (binding.action !== "revoke" && (!authority.eligible || binding.brandPubkey === authority.ownerPubkey || binding.brandPubkey === SUPER_ADMIN_PUBKEY)) throw new Error("A separate city account and eligible Pro city are required.");
  return challengeSchema.parse({version: 1, requestId: input.requestId,
    origin: canonicalOrigin(input.origin), issuedAt: input.now, expiresAt: input.now + 900, authority, binding});
}
export function cityBrandProofTemplate(challenge: CityBrandChallenge, role: "owner" | "brand"): EventTemplate {
  const request = challengeSchema.parse(challenge);
  canonicalOrigin(request.origin);
  return {kind: 27235, created_at: request.issuedAt,
    tags: [["u", `${request.origin}/api/city-brand`], ["t", "bitcoinwalk-city-brand-proof-v1"], ["role", role]],
    content: JSON.stringify(request)};
}
/** Private evidence only. Never publish these proof events to a public relay. */
export function authorizeCityBrand(input: {
  challenge: CityBrandChallenge; currentAuthority: CityBrandAuthority;
  previous: Event | null; ownerProof: Event; brandProof?: Event; now: number;
}): EventTemplate {
  const request = challengeSchema.parse(input.challenge);
  if (!Number.isSafeInteger(input.now) || request.expiresAt !== request.issuedAt + 900 ||
      input.now < request.issuedAt || input.now >= request.expiresAt) throw new Error("City account request expired or not yet valid.");
  if (JSON.stringify(authoritySchema.parse(input.currentAuthority)) !== JSON.stringify(request.authority)) throw new Error("City ownership, approval or entitlement changed. Prepare a new request.");
  successor(request.binding, input.previous);
  const expected = createCityBrandChallenge({requestId: request.requestId, origin: request.origin,
    authority: input.currentAuthority, brandPubkey: request.binding.brandPubkey,
    action: request.binding.action, previous: input.previous, now: request.issuedAt});
  if (JSON.stringify(expected) !== JSON.stringify(request)) throw new Error("City account request changed.");
  for (const role of request.binding.action === "revoke" ? ["owner"] as const : ["owner", "brand"] as const) {
    const proof = role === "owner" ? input.ownerProof : input.brandProof;
    if (!proof) throw new Error("City account proof is required.");
    const event = freshEvent(proof), template = cityBrandProofTemplate(request, role);
    if (event.pubkey !== (role === "owner" ? request.authority.ownerPubkey : request.binding.brandPubkey) ||
        event.kind !== template.kind || event.created_at !== template.created_at ||
        event.content !== template.content || JSON.stringify(event.tags) !== JSON.stringify(template.tags)) throw new Error("City account proof does not match the owner, role or request.");
  }
  return {kind: CITY_BRAND_KIND, created_at: request.issuedAt,
    tags: tags(request.binding), content: JSON.stringify(request.binding)};
}

/** Resolve complete retained history, refusing branches, gaps and cross-city rows.
 * Caller must establish complete authoritative read-back, not a partial cache. */
export function resolveCityBrand(events: Event[], cityId: string): {event: Event; binding: CityBrandBinding} | null {
  const unique = [...new Map(events.map(event => [event.id, event])).values()];
  const rows = unique.map(event => ({event, binding: readCityBrand(event)})).sort((a, b) => a.binding.sequence - b.binding.sequence);
  let previous: Event | null = null;
  for (const row of rows) {
    if (row.binding.cityId !== cityId) throw new Error("Foreign city account binding.");
    successor(row.binding, previous);
    if (previous && row.event.created_at < previous.created_at) throw new Error("City account history moved backwards.");
    previous = row.event;
  }
  return rows.at(-1) ?? null;
}
