import {readFileSync} from "node:fs";
import {describe,expect,it,vi} from "vitest";
import {runScheduledNotificationScan} from "../../scripts/run-web-notification-scan.mjs";

const token="n".repeat(48),env={NODE_ENV:"test" as const,BITCOINWALK_NOTIFICATION_RUN_TOKEN:token};
describe("scheduled notification runner",()=>{
 it("schedules only a masked read-only preview by default",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({checkedAt:123,readOnly:true,candidates:[{recipient:"masked",path:"/private"}]}),{status:200}));
  expect(await runScheduledNotificationScan(env,fetcher as typeof fetch)).toEqual({checkedAt:123,mode:"preview",candidates:1});
  expect(fetcher).toHaveBeenCalledWith(new URL("http://127.0.0.1:3000/api/internal/notifications/run"),expect.objectContaining({method:"GET",headers:{authorization:`Bearer ${token}`}}));
  expect(JSON.stringify(await runScheduledNotificationScan(env,fetcher as typeof fetch))).not.toContain("masked");
 });
 it("rejects remote targets, malformed results and failed send attempts",async()=>{
  await expect(runScheduledNotificationScan({...env,BITCOINWALK_NOTIFICATION_RUN_URL:"https://example.com/api/internal/notifications/run"})).rejects.toThrow("unsafe");
  await expect(runScheduledNotificationScan(env,vi.fn(async()=>Response.json({checkedAt:1,candidates:[]})) as typeof fetch)).rejects.toThrow("invalid");
  await expect(runScheduledNotificationScan({...env,BITCOINWALK_NOTIFICATION_RUN_METHOD:"POST"},vi.fn(async()=>Response.json({checkedAt:1,candidates:1,created:1,sent:0,deferred:0,failed:1})) as typeof fetch)).rejects.toThrow("failed delivery");
 });
 it("keeps the installed schedule read-only and bounded",()=>{
  const service=readFileSync(new URL("../../deploy/bitcoinwalk-notification-preview.service",import.meta.url),"utf8"),timer=readFileSync(new URL("../../deploy/bitcoinwalk-notification-preview.timer",import.meta.url),"utf8"),installer=readFileSync(new URL("../../deploy/install-staging-notification-preview.sh",import.meta.url),"utf8");
  expect(service).toContain("BITCOINWALK_NOTIFICATION_RUN_METHOD=GET");expect(service).toContain("http://127.0.0.1:3000/");expect(service).toContain("TimeoutStartSec=75");expect(service).not.toContain("SENDERS_ENABLED");
  expect(timer).toContain("OnUnitActiveSec=15min");expect(timer).toContain("Persistent=false");
  expect(installer).toContain('source_config="$config_dir/app.env"');expect(installer).toContain("systemctl --user start bitcoinwalk-notification-preview.service");expect(installer).toContain("trap rollback ERR");expect(installer).not.toContain("SENDERS_ENABLED");
 });
});
