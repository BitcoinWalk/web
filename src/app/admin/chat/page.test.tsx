import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import ChatPage from "./page";

describe("dashboard chat",()=>{it("renders the conversation rail and rich group composer guidance",()=>{const html=renderToStaticMarkup(createElement(ChatPage));expect(html).toContain('aria-label="Conversations"');expect(html).not.toContain("<select");expect(html).toContain("Choose a chat");expect(html).toContain("Enter to send");expect(html).toContain("Shift+Enter");expect(html).toContain("Type @ to tag someone");expect(html).toContain("Photo");});it("adds Global for everyone and Hosts only for host roles",()=>{const source=readFileSync("src/app/admin/chat/page.tsx","utf8");expect(source).toContain('configuredNip29Room("BitcoinWalk Global","global"');expect(source).toContain('dashboard.role==="organizer"||dashboard.role==="super-admin"');expect(source).toContain('configuredNip29Room("Hosts","hosts"');expect(source).toContain('room?.scope!=="hosts"');});});
