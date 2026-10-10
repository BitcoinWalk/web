import {getEventHash, verifyEvent, type Event, type EventTemplate} from "nostr-tools";

export type ManagedCityProfile = {
  name: string;
  picture: string;
  banner: string;
  website: string;
  nip05?: string;
  lud16?: string;
};

function retainedProfile(content?: string): Record<string, unknown> {
  if (!content || content.length > 16_000) return {};
  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const retained: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key)) continue;
      if (["name", "display_name", "picture", "banner", "website", "nip05", "lud16", "lud06"].includes(key)) continue;
      if ((typeof field === "string" && field.length <= 4_000) || (typeof field === "number" && Number.isFinite(field)) || typeof field === "boolean") retained[key] = field;
    }
    return retained;
  } catch { return {}; }
}

/** Builds a replaceable kind-0 profile. BitcoinWalk-managed fields are always
 * reconstructed from verified current setup; unrelated simple fields survive. */
export function cityProfileTemplate(profile: ManagedCityProfile, previous?: Event, now = Math.floor(Date.now() / 1000)): EventTemplate {
  const content: Record<string, unknown> = {...retainedProfile(previous?.content), name: profile.name, display_name: profile.name,
    picture: profile.picture, banner: profile.banner, website: profile.website};
  if (profile.nip05) content.nip05 = profile.nip05;
  if (profile.lud16) content.lud16 = profile.lud16;
  const encoded = JSON.stringify(content);
  if (encoded.length > 16_000) throw new Error("The city profile is too large to publish safely.");
  return {kind: 0, created_at: now, tags: [], content: encoded};
}

export function authorizeCityProfile(event: Event, expectedPubkey: string, template: EventTemplate): Event {
  if (event.pubkey !== expectedPubkey || event.kind !== 0 || event.created_at !== template.created_at || event.content !== template.content ||
      JSON.stringify(event.tags) !== JSON.stringify(template.tags) || getEventHash(event) !== event.id || !verifyEvent(event)) {
    throw new Error("The city signer changed the prepared profile.");
  }
  return event;
}

