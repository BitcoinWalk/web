import { z } from "zod";

export const CITY_PROFILE_KIND = 30301;
export const CITY_AUTHORIZATION_KIND = 30302;
export const CITY_UPDATE_KIND = 30303;
export const ADMIN_APPROVAL_KIND = 30304;
export const CALENDAR_EVENT_KIND = 31923;

export const SUPER_ADMIN_NPUB =
  "npub1jr8sgwrpuk66n9evk76jnfd6wxept4k3uv2vwjw42fhvzvl3mdes38wwnw";

export const citySlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens")
  .min(2)
  .max(63);

export function normalizedCityName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function cityAliases(value: string | string[], canonicalName = ""): string[] {
  const values=Array.isArray(value)?value:value.split(/[\n,;]+/);
  const canonical=normalizedCityName(canonicalName),seen=new Set<string>(),aliases:string[]=[];
  for(const item of values) {
    const alias=item.trim(),key=normalizedCityName(alias);
    if(!alias||!key||key===canonical||seen.has(key))continue;
    seen.add(key);aliases.push(alias);
  }
  return aliases;
}

const cityAliasesSchema=z.array(z.string().trim().min(1).max(100)).max(20).superRefine((aliases,ctx)=>{
  const seen=new Set<string>();
  aliases.forEach((alias,index)=>{const key=normalizedCityName(alias);if(!key||seen.has(key))ctx.addIssue({code:"custom",path:[index],message:"Alternative city names must be unique"});seen.add(key);});
});

export const cityDocumentSchema = z.object({
  cityId: z.string().uuid(),
  slug: citySlugSchema,
  cityName: z.string().min(1).max(100),
  /** Optional BCP-47 casing locale for deterministic localized brand assets. */
  locale: z.string().min(2).max(35).refine(value => {
    try { new Intl.Locale(value); return true; } catch { return false; }
  }, "Use a valid language locale").optional(),
  /** Search-only localized and conventional names. Never routes or display titles. */
  aliases: cityAliasesSchema.optional(),
  // Organizer preference only. Never proof of payment or paid-relay entitlement.
  requestedTier: z.enum(["free", "paid"]).optional(),
  startAt: z.string().datetime(),
  /** Exact organizer-signed starts submitted with a new city. The first entry
   * equals startAt; approval releases only the referenced signed events. */
  initialWalkStarts: z.array(z.string().datetime()).min(1).max(8).optional(),
  description: z.string().min(1).max(5000),
  meetingPoint: z.object({
    description: z.string().min(1).max(500),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  chatUrl: z.url().optional(),
  // Optional on registration. The super-admin may provide the first fallback
  // image in the approval; organizers can propose a replacement later.
  heroImageUrl: z.url().optional(),
  sponsor: z
    .object({ name: z.string().min(1).max(100), logoUrl: z.url(), offer: z.string().max(300).optional() })
    .optional(),
});

export type CityDocument = z.infer<typeof cityDocumentSchema>;

export const cityAuthorizationSchema = z.object({
  cityId: z.string().uuid(),
  creatorPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  creatorRevisionId: z.string().regex(/^[0-9a-f]{64}$/),
  editorPubkeys: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1).max(100),
  superAdminPubkey: z.string().regex(/^[0-9a-f]{64}$/),
}).refine(value => value.editorPubkeys.includes(value.creatorPubkey), "Creator must remain an editor");

export type CityAuthorization = z.infer<typeof cityAuthorizationSchema>;

export const cityApprovalSchema = z.object({
  cityId: z.string().uuid(),
  cityRevisionId: z.string().regex(/^[0-9a-f]{64}$/),
  /** The organizer-signed first walk released by this approval. Older
   * decisions omit it and retain their existing behaviour. */
  initialEventId: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  initialEventIds: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1).max(8).optional(),
  heroImageUrl: z.url().optional(),
  /** Optional super-admin override for the public URL. */
  slug: citySlugSchema.optional(),
  /** Optional super-admin override for search-only alternative names. An empty
   * list explicitly clears aliases from the approved public city. */
  aliases: cityAliasesSchema.optional(),
  status: z.enum(["approved", "rejected", "revoked"]),
  note: z.string().max(500).optional(),
});

export type CityApproval = z.infer<typeof cityApprovalSchema>;

export function cityHostname(): string {
  return "bitcoinwalk.org";
}

export function cityPath(city: Pick<CityDocument, "slug">): string {
  return `/${city.slug}`;
}
