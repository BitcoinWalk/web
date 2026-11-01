import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("city revision automation runtime",()=>{
 it("returns from dry-run before credentials, database or policy are read",()=>{const source=readFileSync("scripts/run-city-revision-automation.ts","utf8"),dryRun=source.indexOf('if(mode==="--dry-run")'),credentials=source.indexOf("const credentials=");expect(dryRun).toBeGreaterThan(0);expect(credentials).toBeGreaterThan(dryRun);expect(source.slice(dryRun,credentials)).toContain("return;");});
 it("packages a fixed staging check with no installed signer or policy",()=>{const check=readFileSync("deploy/city-revision-automation/check-staging.sh","utf8"),installer=readFileSync("deploy/city-revision-automation/install-disabled.sh","utf8");expect(check).toContain('"$worker" --dry-run');expect(check).toContain("unset CREDENTIALS_DIRECTORY BITCOINWALK_PAYMENT_DATABASE");expect(installer).toContain("No signer, policy, service or timer was installed.");expect(installer).not.toContain("systemctl enable");});
});
