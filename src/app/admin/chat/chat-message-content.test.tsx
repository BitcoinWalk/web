import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {nip19} from "nostr-tools";
import {describe,expect,it} from "vitest";
import ChatMessageContent,{mentionedPubkeys} from "./chat-message-content";

describe("rich chat messages",()=>{
 it("resolves npub mentions to profile names while preserving the Nostr link",()=>{const pubkey="a".repeat(64),npub=nip19.npubEncode(pubkey),content=`Hello nostr:${npub} https://example.org/story`,html=renderToStaticMarkup(createElement(ChatMessageContent,{content,profiles:{[pubkey]:{name:"Satoshi"}}}));expect(mentionedPubkeys(content)).toEqual([pubkey]);expect(html).toContain(`href="nostr:${npub}"`);expect(html).toContain("@Satoshi");expect(html).toContain(`title="${npub}"`);expect(html).toContain('href="https://example.org/story"');});
 it("renders immutable BitcoinWalk chat images inline",()=>{const url=`https://app-staging.bitcoinwalk.org/api/media/files/${"b".repeat(64)}.webp`,html=renderToStaticMarkup(createElement(ChatMessageContent,{content:url}));expect(html).toContain('alt="Chat attachment"');expect(html).toContain(url);});
 it("does not repeat a plain URL while its optional preview is unavailable",()=>{const url="https://app-staging.bitcoinwalk.org/admin/upgrade?city=madeira",html=renderToStaticMarkup(createElement(ChatMessageContent,{content:`Track the update: ${url}`}));expect(html.match(/href=/g)).toHaveLength(1);});
});
