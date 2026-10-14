import { resolveCityChat } from "../domain/chat";
import { configuredPaidCity } from "../lib/directory-config";
import { loadCalendarWalks } from "../nostr/calendar-records";
import { serverReadRelays } from "../lib/server-relay-config";
import { serverChatConfig } from "./chat-config";
import { renderedShareImage, shareOrigin } from "./share-preview";

type PublicCommunityDestination = {
  relay: string;
  groupId: string;
};

export type PublicCityDirectoryItem = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  canonicalUrl: string;
  avatarUrl: string;
  chat: {
    scope: "global" | "city";
    url: string | null;
    nip29: PublicCommunityDestination | null;
    communities: {
      global: PublicCommunityDestination | null;
      city: PublicCommunityDestination | null;
    };
  };
};

export type PublicCityDirectory = {
  version: 1;
  generatedAt: string;
  cities: PublicCityDirectoryItem[];
};

/** Public projection of approved cities. It deliberately contains no owner,
 * payment, private-relay or moderation data. A paid city never falls back to
 * the global room while its dedicated NIP-29 destination is incomplete. */
export async function loadPublicCityDirectory(now = Date.now()): Promise<PublicCityDirectory> {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid directory time.");
  const origin = shareOrigin();
  const walks = await loadCalendarWalks(serverReadRelays());
  const chatConfig = serverChatConfig();
  const cities = new Map<string, PublicCityDirectoryItem>();
  for (const walk of walks) {
    const city = walk.revision.city;
    if (cities.has(city.cityId)) continue;
    const aliases = [...new Set((city.aliases ?? []).filter((alias) => alias && alias.length <= 120))];
    const paid = !!configuredPaidCity(city.cityId, [city.slug, ...aliases]);
    const chat = resolveCityChat(city.cityId, city.slug, chatConfig, paid);
    let avatarUrl = `${origin}/brand/bitcoinwalk-share-fallback.jpg`;
    try {
      avatarUrl = await renderedShareImage(
        city.cityId,
        city.slug,
        [walk.approval?.approval?.heroImageUrl, city.heroImageUrl],
        null,
      );
    } catch {
      // A valid city directory remains available while optional artwork is busy.
    }
    cities.set(city.cityId, {
      id: city.cityId,
      name: city.cityName,
      slug: city.slug,
      aliases,
      canonicalUrl: `${origin}/${encodeURIComponent(city.slug)}`,
      avatarUrl,
      chat: {
        scope: chat.scope,
        url: chat.url,
        nip29: chat.nip29,
        communities: {
          global: chatConfig.global,
          city: chat.scope === "city" ? chat.nip29 : null,
        },
      },
    });
  }
  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    cities: [...cities.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  };
}
