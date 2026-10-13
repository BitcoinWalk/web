import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {nip19} from "nostr-tools";
import {describe,expect,it} from "vitest";
import ChatMessageContent from "./chat-message-content";

describe("rich chat messages",()=>{
 it("links npub mentions and HTTPS URLs",()=>{const npub=nip19.npubEncode("a".repeat(64)),html=renderToStaticMarkup(createElement(ChatMessageContent,{content:`Hello nostr:${npub} https://example.org/story`}));expect(html).toContain(`href="nostr:${npub}"`);expect(html).toContain('href="https://example.org/story"');});
 it("renders immutable BitcoinWalk chat images inline",()=>{const url=`https://app-staging.bitcoinwalk.org/api/media/files/${"b".repeat(64)}.webp`,html=renderToStaticMarkup(createElement(ChatMessageContent,{content:url}));expect(html).toContain('alt="Chat attachment"');expect(html).toContain(url);});
});
