import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("sponsor checkout recovery",()=>{
 it("requires an explicit upload action after choosing the recovery file",()=>{const source=readFileSync("src/app/sponsor/checkout.tsx","utf8"),chooser=source.indexOf('accept="application/json,.json"'),button=source.indexOf('Upload and recover checkout');expect(chooser).toBeGreaterThan(0);expect(button).toBeGreaterThan(chooser);expect(source).toContain('setRecoveryFile(event.target.files?.[0]??null)');expect(source).toContain('disabled={busy||!recoveryFile}');expect(source).not.toContain('onChange={event=>{const file=event.target.files?.[0]');});
});
