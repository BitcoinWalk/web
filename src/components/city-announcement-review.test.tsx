import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("new-city announcement review",()=>{
 it("keeps staging fail closed while preserving signed retry and partial relay results",()=>{const source=readFileSync("src/components/city-announcement-review.tsx","utf8"),config=readFileSync("src/lib/relay-config.ts","utf8");expect(config).toContain("NEXT_PUBLIC_ANNOUNCEMENT_RELAYS");expect(config).toContain("NEXT_PUBLIC_ANNOUNCEMENT_NOT_BEFORE");expect(config).toContain("Intentionally no default");expect(source).toContain("Review and sign the separate");expect(source).toContain("localStorage.setItem(STORAGE+candidate.walk.revision.city.cityId,JSON.stringify(event))");expect(source).toContain("targets=relays.filter(relay=>!alreadyVerified.includes(relay))");expect(source).toContain("announcement verified on ${accepted}/${relays.length} relays");expect(source).toContain("already has a different signed launch announcement");expect(source).toContain("Publishing disabled");expect(source).toContain("Skip announcement");expect(source).toContain("Skipping does not affect city approval");});
});
