import { resolveCityChat, type ChatConfig } from "../domain/chat";
import { chatConfig } from "../lib/chat-config";

export default function CityChat({ cityId, slug, config = chatConfig }: { cityId?: string; slug: string; config?: ChatConfig }) {
  const chat = resolveCityChat(cityId, slug, config);
  return (
    <section aria-label="BitcoinWalk chat">
      <h2>{chat.scope === "global" ? "Global BitcoinWalk chat" : "City BitcoinWalk chat"}</h2>
      {chat.environment === "staging" && <p>Staging chat — for testing before launch.</p>}
      {chat.url ? <>
        <p>Anyone can join without approval. Messages are visible to joined members only.</p>
        <p><a className="chat-button" href={chat.url} rel="noreferrer">Join chat in Armada</a></p>
        <p>Opens Armada’s website, or its app if your device is configured to open Armada links. Sign in with your Nostr signer, then join the channel.</p>
      </> : <p>Chat is being set up. Please check back soon.</p>}
    </section>
  );
}
