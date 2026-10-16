import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import ChatPage from "./page";

describe("dashboard chat",()=>{it("renders one focused room picker and account-scoped composer guidance",()=>{const html=renderToStaticMarkup(createElement(ChatPage));expect(html).toContain("Choose a chat");expect(html).toContain("Drafts and photos stay with this account and chat");expect(html).toContain("Enter to send");expect(html).toContain("Shift+Enter");expect(html).toContain("Type @ to tag someone");expect(html).toContain("Photo");expect(html).not.toContain("BitcoinWalk Guide");expect(html).not.toContain("PRIVATE MESSAGES");});});
