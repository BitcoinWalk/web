import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import ChatPage from "./page";

describe("dashboard chat",()=>{it("shows the four conversation destinations without pretending unfinished transports work",()=>{const html=renderToStaticMarkup(createElement(ChatPage));for(const label of ["City","Guide","Global","Organizers"])expect(html).toContain(`>${label}<`);expect(html).toContain("Guide — coming soon");expect(html).toContain("Organizers — coming soon");expect(html).toContain("Drafts and photos stay with this account and chat");expect(html).toContain("Enter to send");expect(html).toContain("Shift+Enter");expect(html).toContain("Type @ to tag someone");expect(html).toContain("Photo");expect(html).not.toContain("PRIVATE MESSAGES");});});
