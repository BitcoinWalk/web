import {afterEach,describe,expect,it,vi} from "vitest";

const {previewNotificationScan,runNotificationScan}=vi.hoisted(()=>({previewNotificationScan:vi.fn(async()=>({checkedAt:1,readOnly:true,candidates:[]})),runNotificationScan:vi.fn(async()=>({checkedAt:1,candidates:2,created:2,sent:0,deferred:2,failed:0}))}));
vi.mock("../../../../../payments/runtime",()=>({getPaymentRuntime:()=>({store:{db:{}}})}));
vi.mock("../../../../../notifications/notification-scan",()=>({previewNotificationScan,runNotificationScan}));
vi.mock("../../../../../notifications/web-push-store",()=>({WebPushStore:class{}}));
import {GET,POST} from "./route";

const token="n".repeat(48),request=(authorization?:string)=>new Request("https://bitcoinwalk.org/api/internal/notifications/run",{method:"POST",headers:authorization?{authorization}:{}});
afterEach(()=>{delete process.env.BITCOINWALK_NOTIFICATION_PREVIEW_ENABLED;delete process.env.BITCOINWALK_NOTIFICATION_SENDERS_ENABLED;delete process.env.BITCOINWALK_NOTIFICATION_RUN_TOKEN;previewNotificationScan.mockClear();runNotificationScan.mockClear();});

describe("notification sender runner",()=>{
 it("stays undiscoverable until the sender and its credential are enabled",async()=>{process.env.BITCOINWALK_NOTIFICATION_RUN_TOKEN=token;expect((await POST(request(`Bearer ${token}`))).status).toBe(404);expect(runNotificationScan).not.toHaveBeenCalled();});
 it("rejects an incorrect bearer token without running the scan",async()=>{process.env.BITCOINWALK_NOTIFICATION_SENDERS_ENABLED="1";process.env.BITCOINWALK_NOTIFICATION_RUN_TOKEN=token;expect((await POST(request("Bearer wrong"))).status).toBe(403);expect(runNotificationScan).not.toHaveBeenCalled();});
 it("runs one bounded scan only with the exact credential",async()=>{process.env.BITCOINWALK_NOTIFICATION_SENDERS_ENABLED="1";process.env.BITCOINWALK_NOTIFICATION_RUN_TOKEN=token;const response=await POST(request(`Bearer ${token}`));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({candidates:2,sent:0});expect(runNotificationScan).toHaveBeenCalledTimes(1);});
 it("exposes a separately enabled read-only preview without enabling POST",async()=>{process.env.BITCOINWALK_NOTIFICATION_PREVIEW_ENABLED="1";process.env.BITCOINWALK_NOTIFICATION_RUN_TOKEN=token;expect((await GET(request("Bearer wrong"))).status).toBe(403);const response=await GET(request(`Bearer ${token}`));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({readOnly:true,candidates:[]});expect(previewNotificationScan).toHaveBeenCalledTimes(1);expect((await POST(request(`Bearer ${token}`))).status).toBe(404);expect(runNotificationScan).not.toHaveBeenCalled();});
});
