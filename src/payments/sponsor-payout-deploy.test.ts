import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const file=(name:string)=>readFileSync(name,"utf8");
describe("disabled sponsor payout deployment",()=>{
 it("ships with no payout, invitation, credential or network authority",()=>{
  const runtime=file("scripts/run-sponsor-payout-service.ts"),install=file("integrations/sponsor-payout-service/install-disabled.sh");
  expect(runtime).toContain('mode:"disabled"');expect(runtime).toContain("payoutsEnabled:false");expect(runtime).toContain("hostInvitationsEnabled:false");expect(runtime).toContain("credentialLoaded:false");expect(runtime).toContain("networkAccess:false");expect(runtime).toContain('restartReconciliation:"blocked-disabled"');
  expect(runtime).not.toMatch(/Nwc|nostr\+walletconnect|pay_invoice/);expect(install).toContain("--network none");expect(install).toContain("--read-only");expect(install).toContain("--cap-drop ALL");expect(install).not.toContain("nwc-uri");
 });
 it("backs up, restores and monitors the exact disabled service",()=>{
  const backup=file("integrations/sponsor-payout-service/backup-state.sh"),monitor=file("integrations/sponsor-payout-service/monitor-disabled.sh");
  expect(backup).toContain("state-tool.py");expect(backup).toContain('state-tool.py" backup');expect(backup).toContain('state-tool.py" verify-backup');expect(backup).not.toContain("docker ");
  expect(monitor).toContain("state-tool.py");expect(monitor).toContain('state-tool.py" verify-live');expect(monitor).not.toContain("docker ");expect(monitor).toContain("28800");
 });
 it("installs periodic backup and monitoring without enabling the product flag",()=>{
  const install=file("integrations/sponsor-payout-service/install-disabled.sh");
  expect(install).toContain("bitcoinwalk-sponsor-payout-backup.timer");expect(install).toContain("bitcoinwalk-sponsor-payout-monitor.timer");expect(install).not.toContain("BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED");
 });
});
