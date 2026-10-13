import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import ChatPage from "./page";

describe("dashboard chat",()=>{it("keeps the public city room and private Guide channel distinct",()=>{const html=renderToStaticMarkup(createElement(ChatPage));expect(html).toContain("Walkie Talkie");expect(html).toContain("# chat");expect(html).toContain("BitcoinWalk Guide");expect(html).toContain("NIP-17");expect(html).toContain("NIP-29 relay");});});
