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

export const cityDocumentSchema = z.object({
  cityId: z.string().uuid(),
  slug: citySlugSchema,
  cityName: z.string().min(1).max(100),
  // Organizer preference only. Never proof of payment or paid-relay entitlement.
  requestedTier: z.enum(["free", "paid"]).optional(),
  startAt: z.string().datetime(),
  description: z.string().min(1).max(5000),
  meetingPoint: z.object({
    description: z.string().min(1).max(500),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  chatUrl: z.url().optional(),
  heroImageUrl: z.url(),
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
  status: z.enum(["approved", "rejected", "revoked"]),
  note: z.string().max(500).optional(),
});

export type CityApproval = z.infer<typeof cityApprovalSchema>;

export function cityHostname(city: Pick<CityDocument, "slug">, hasPaidRelay: boolean): string {
  return hasPaidRelay ? `${city.slug}.bitcoinwalk.org` : "bitcoinwalk.org";
}

export function cityPath(city: Pick<CityDocument, "slug">, hasPaidRelay: boolean): string {
  return hasPaidRelay ? "/" : `/${city.slug}`;
}
