import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("Armada monitoring",()=>{it("keeps dedicated Armada creation separate from shared Walkie Talkie",()=>{const page=readFileSync("src/app/admin/monitoring/armada/page.tsx","utf8");expect(page).toContain("Sign, create and verify Armada group");expect(page).toContain("Sign and activate Armada community");expect(page).toContain('`wss://${city.slug}.bitcoinwalk.org/`');expect(page).not.toContain("wss://chat.bitcoinwalk.org/");});});
