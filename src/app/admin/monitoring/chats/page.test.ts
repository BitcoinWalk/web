import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("paid-city community administration",()=>{it("creates, verifies and activates through separate signed actions",()=>{const page=readFileSync("src/app/admin/monitoring/chats/page.tsx","utf8"),layout=readFileSync("src/app/admin/monitoring/layout.tsx","utf8");expect(layout).toContain('href="/admin/monitoring/chats"');expect(page).toContain("Sign and create group");expect(page).toContain("Sign and verify group");expect(page).toContain("Sign and activate community");expect(page).toContain("signed public, open-join NIP-29 metadata");expect(page).not.toContain("private key");expect(page).not.toContain("chat-${selected.slug}");});});
