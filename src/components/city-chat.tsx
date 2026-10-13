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
  if(!chat.walkieTalkieEnabled&&!chat.armadaEnabled)return null;
  return <>
    {chat.walkieTalkieEnabled&&<section aria-label="Walkie Talkie">
      <h2>Walkie Talkie</h2>
      <p>Community messaging using NIP-29, with NIP-17 support.</p>
    </section>}
    {chat.armadaEnabled&&chat.url&&<section aria-label="Armada">
      <h2>Armada</h2>
      {chat.environment === "staging" && <p>Staging community — for testing before launch.</p>}
      <p>Open this community in Armada Concord.</p>
      <p><a className="chat-button" href={chat.url} target="_blank" rel="noopener noreferrer">Open Armada ↗</a></p>
    </section>}
  </>;
}
