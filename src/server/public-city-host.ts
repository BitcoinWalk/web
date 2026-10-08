import type {Event} from "nostr-tools";
import {CITY_BRAND_KIND, resolveCityBrand} from "../nostr/city-brand";
import {queryCityAuthorization, queryRelayEvents} from "../nostr/city-records";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {serverReadRelays} from "../lib/server-relay-config";

export type PublicCityHost =
  | {state: "brand"; pubkey: string; name: string}
  | {state: "personal"; pubkey: string}
  | {state: "unavailable"};

type HostDependencies = {
  relays: () => string[];
  read: (relay: string, cityId: string) => Promise<Event[]>;
  creator?: (relays: string[], cityId: string) => Promise<string | undefined>;
};
export const publicCityHostDependencies: HostDependencies = {
  relays: serverReadRelays,
  read: (relay: string, cityId: string) => queryRelayEvents([relay], [CITY_BRAND_KIND], undefined,
    {authors: [SUPER_ADMIN_PUBKEY], "#i": [cityId], limit: 500}),
  creator: async (relays, cityId) => (await queryCityAuthorization(relays, cityId))?.grant.creatorPubkey,
};

/** Called only for a publicly approved city. Never reads private owner proofs or
 * payout data. A failed, capped, conflicting or revoked read cannot reveal the
 * historical personal host. No cross-request cache may resurrect an old binding. */
export async function resolvePublicCityHost(cityId: string, cityName: string, personalPubkey?: string,
  deps = publicCityHostDependencies): Promise<PublicCityHost> {
  try {
    const relays = [...new Set(deps.relays())];
    if (!relays.length) return {state: "unavailable"};
    const heads = await Promise.all(relays.map(async relay => {
      const events: Event[] = await deps.read(relay, cityId);
      if (events.length >= 500) throw new Error("Incomplete city identity history.");
      return resolveCityBrand(events, cityId);
    }));
    const head = heads[0];
    if (heads.some(value => value?.event.id !== head?.event.id)) return {state: "unavailable"};
    if (!head) {
      // A latest city revision can be signed by an editor, not its creator.
      const pubkey = personalPubkey ?? await deps.creator?.(relays, cityId);
      return pubkey ? {state: "personal", pubkey} : {state: "unavailable"};
    }
    if (head.binding.action === "revoke") return {state: "unavailable"};
    return {state: "brand", pubkey: head.binding.brandPubkey, name: `BitcoinWalk in ${cityName}`};
  } catch {
    return {state: "unavailable"};
  }
}
