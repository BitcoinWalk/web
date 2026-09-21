import { cityDocumentSchema } from "./city";

export type RequestedTier = "free" | "paid";
export const PAID_PRICE_SATS = 21_000;
export const PLAN_BENEFITS = [
  { benefit: "Public walk page and city directory", free: "Included", paid: "Included" },
  { benefit: "Nostr relay", free: "Shared BitcoinWalk relay", paid: "Dedicated city relay" },
  { benefit: "City subdomain", free: "Not included", paid: "<city>.bitcoinwalk.org" },
  { benefit: "Community through Armada", free: "Global BitcoinWalk community", paid: "Dedicated members-only city community with moderation" },
  { benefit: "NIP-05 identity / verified badge", free: "Not included", paid: "Included after activation" },
  { benefit: "City Lightning address / LNURL", free: "Not included", paid: "<city>@bitcoinwalk.org · 79% organizer / 21% BitcoinWalk" },
  { benefit: "Download / transfer relay to your own node", free: "Not included", paid: "Planned — BitcoinWalk app for Umbrel, Start9 and other supported nodes" },
  { benefit: "Local marketplace", free: "Not included", paid: "Future capability — not available yet" },
] as const;

export function registrationDocument(input: {
  cityId: string; cityName: string; startAt: string; description: string;
  location: { latitude: number; longitude: number; description: string } | null;
  meetingDescription: string; heroImageUrl: string; requestedTier: RequestedTier; chatUrl?: string;
}) {
  const date = new Date(input.startAt);
  if (!input.location || Number.isNaN(date.getTime()) || !input.heroImageUrl.trim()) {
    throw new Error("Choose a map pin, a valid date and time, and a hero image before continuing.");
  }
  const result = cityDocumentSchema.safeParse({
    cityId: input.cityId, cityName: input.cityName.trim(), slug: registrationSlug(input.cityName),
    startAt: date.toISOString(), description: input.description.trim(),
    meetingPoint: { ...input.location, description: input.meetingDescription.trim() || input.location.description },
    heroImageUrl: input.heroImageUrl.trim(), requestedTier: input.requestedTier, chatUrl: input.chatUrl,
  });
  if (!result.success) throw new Error("Please complete valid city, description, meeting-point and image details before continuing.");
  return result.data;
}

export function registrationSlug(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
