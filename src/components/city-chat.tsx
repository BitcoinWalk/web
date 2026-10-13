import { resolveCityChat, type ChatConfig } from "../domain/chat";
import { chatConfig } from "../lib/chat-config";
import { directoryConfig } from "../lib/directory-config";

export function cityChatDetails({ cityId, slug, config = chatConfig, paid }: { cityId?: string; slug: string; config?: ChatConfig; paid?: boolean }) {
  const entitlement = cityId && Object.hasOwn(directoryConfig.paidCities, cityId) ? directoryConfig.paidCities[cityId] : undefined;
  const verifiedPaid = paid ?? (entitlement?.slug === slug ? true : undefined);
  return resolveCityChat(cityId, slug, config, verifiedPaid);
}

export default function CityChat({ cityId, slug, config = chatConfig, paid }: { cityId?: string; slug: string; config?: ChatConfig; paid?: boolean }) {
  const chat = cityChatDetails({cityId,slug,config,paid});
  return (
    <section aria-label="BitcoinWalk chat">
      <h2>Walkie Talkie</h2>
      {chat.environment === "staging" && <p>Staging chat — for testing before launch.</p>}
      {chat.url ? <>
        <p>This public community uses NIP-29. Anyone can join without approval; messages are visible to joined members only.</p>
        <p><a className="chat-button" href={chat.url} target="_blank" rel="noopener noreferrer">Open Armada ↗</a></p>
        <p>Armada is one compatible client. Sign in with your Nostr signer, then join the channel. NIP-17 direct messages remain separate.</p>
      </> : chat.scope==="city"?<p>The organizer has not enabled a public Armada link for this city.</p>:<p>Chat is being set up. Please check back soon.</p>}
    </section>
  );
}
