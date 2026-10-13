import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("organizer community visibility",()=>{it("uses independent owner-signed ON/OFF controls",()=>{const source=readFileSync("src/app/admin/pro-setup/screen.tsx","utf8");expect(source).toContain('action:"set-community-visibility"');expect(source).toContain("Show Walkie Talkie on public city and walk pages");expect(source).toContain("Show Armada on public city and walk pages");expect(source).toContain("NIP-29 messaging with NIP-17 support");expect(source).toContain("Concord community");expect(source).toContain('aria-pressed={preview.community.walkieTalkieEnabled}');expect(source).toContain('aria-pressed={preview.community.armadaEnabled}');});});
