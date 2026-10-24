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

describe("Madeira-only staging invitation activation",()=>{
 it("cannot activate another city or the payout sender",()=>{const script=readFileSync("deploy/enable-madeira-host-sponsor-invitations-0.3.394.sh","utf8");expect(script).toContain("BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1");expect(script).toContain("BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=$madeira");expect(script).toContain("83f15504-9fca-4d59-a0f6-616a559510df");expect(script).not.toMatch(/NWC|pay_invoice|SPONSOR_PAYOUT_MODE|213\.232\.235\.240/);expect(script).toContain("payout sender remains disabled");});
 it("reconciles reviewed Madeira evidence and lets verified future Pro cities qualify without enabling payouts",()=>{const script=file("deploy/repair-pro-sponsor-eligibility-0.3.399.sh"),migration=file("scripts/mirror-madeira-sponsor-eligibility.ts");expect(script).toContain("BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=*");expect(script).toContain("mirror-madeira-sponsor-eligibility.mjs");expect(script).not.toMatch(/NWC|pay_invoice|213\.232\.235\.240/);expect(script).toContain("payout sender remains disabled");expect(migration).toContain("--apply");expect(migration).toContain("BEGIN IMMEDIATE");expect(migration).toContain("await backup");});
});

describe("production sponsor payout containment",()=>{
 it("pauses new host invitations without changing orders or loading a wallet",()=>{const script=file("deploy/pause-production-host-sponsor-invitations-2026-10-24.sh");expect(script).toContain("UnsetEnvironment=BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS");expect(script).toContain("0.3.507-b02c260cfb6a");expect(script).not.toMatch(/payments\.sqlite|NWC|pay_invoice|UPDATE sponsorship|DELETE FROM sponsorship/);});
 it("binds each environment to its canonical checkout database",()=>{const runner=file("scripts/run-sponsor-payout-order.ts");expect(runner).toContain('z.enum(["staging","production"])');expect(runner).toContain('/var/lib/bitcoinwalk-app-staging/payments.sqlite');expect(runner).toContain('/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite');expect(runner).toContain('environment:config.environment');});
});
