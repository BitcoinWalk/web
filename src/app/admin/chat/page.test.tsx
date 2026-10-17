import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import ChatPage from "./page";

describe("dashboard chat",()=>{it("shows four avatar destinations while preserving Guide and host privacy boundaries",()=>{const html=renderToStaticMarkup(createElement(ChatPage)),source=readFileSync("src/app/admin/chat/page.tsx","utf8");for(const label of ["City","Guide","Global","Hosts"])expect(html).toContain(`>${label}<`);expect(html).toContain("Change city chat");expect(html).toContain("Guide — organizer access required");expect(html).toContain("Hosts — host access required");expect(source).toContain("Replies are not monitored yet");expect(source).toContain('room.scope!=="organizers"');expect(source).toContain('deepLink==="hosts"');expect(html).toContain("Drafts and photos stay with this account and chat");expect(html).toContain("Enter to send");expect(html).toContain("Shift+Enter");expect(html).toContain("Type @ to tag someone");expect(html).toContain("Photo");expect(html).not.toContain("PRIVATE MESSAGES");});});
