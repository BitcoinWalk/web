import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("organizer community visibility",()=>{it("uses an owner-signed ON/OFF control without changing the group protocol",()=>{const source=readFileSync("src/app/admin/pro-setup/screen.tsx","utf8");expect(source).toContain('action:"set-community-visibility"');expect(source).toContain("Show Open Armada on public city and walk pages");expect(source).toContain("NIP-29 Walkie Talkie");expect(source).toContain("NIP-17 direct messages remain separate");expect(source).toContain('aria-pressed={preview.community.publicEnabled}');});});
