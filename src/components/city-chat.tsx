import { resolveCityChat, type ChatConfig } from "../domain/chat";
import { chatConfig } from "../lib/chat-config";
import { directoryConfig } from "../lib/directory-config";

export const WALKIE_TALKIE_ZAPSTORE_URL="https://zapstore.dev/apps/org.bitcoinwalk.walkietalkie";

export function cityChatDetails({ cityId, slug, config = chatConfig, paid }: { cityId?: string; slug: string; config?: ChatConfig; paid?: boolean }) {
  const entitlement = cityId && Object.hasOwn(directoryConfig.paidCities, cityId) ? directoryConfig.paidCities[cityId] : undefined;
  const verifiedPaid = paid ?? (entitlement?.slug === slug ? true : undefined);
  return resolveCityChat(cityId, slug, config, verifiedPaid);
}

export default function CityChat({ cityId, slug, config = chatConfig, paid }: { cityId?: string; slug: string; config?: ChatConfig; paid?: boolean }) {
  const chat = cityChatDetails({cityId,slug,config,paid});
  return <>
    <section className="walkie-talkie-card" aria-labelledby="walkie-talkie-title">
      <div className="walkie-talkie-card__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7 18.5 3.5 21v-5.1A8 8 0 0 1 2 11.25C2 6.7 6.48 3 12 3s10 3.7 10 8.25-4.48 8.25-10 8.25c-1.8 0-3.48-.4-5-1Z"/>
        </svg>
      </div>
      <div className="walkie-talkie-card__content">
        <p className="walkie-talkie-card__eyebrow">Your BitcoinWalk companion app</p>
        <h2 id="walkie-talkie-title">Walkie Talkie</h2>
        <p>Join your city chat, meet fellow Bitcoiners and keep the conversation going before and after the walk.</p>
      </div>
      <a className="walkie-talkie-card__action" href={WALKIE_TALKIE_ZAPSTORE_URL} target="_blank" rel="noopener noreferrer">
        <span>Get it on Zapstore</span><span aria-hidden="true">↗</span>
      </a>
    </section>
    {chat.armadaEnabled&&chat.url&&<section aria-label="Armada">
      <h2>Armada</h2>
      {chat.environment === "staging" && <p>Staging community — for testing before launch.</p>}
      <p>Open this community in Armada Concord.</p>
      <p><a className="chat-button" href={chat.url} target="_blank" rel="noopener noreferrer">Open Armada ↗</a></p>
    </section>}
  </>;
}
