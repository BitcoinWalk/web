import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {WebNotificationService,inQuietHours} from "./web-notification-service";
import {WebPushStore} from "./web-push-store";

const owner="a".repeat(64),deviceId="10000000-0000-4000-8000-000000000001",candidate={ownerPubkey:owner,dedupeKey:"walk-24h:event",category:"walk-reminder" as const,title:"Next walk",body:"Tomorrow",path:"/madeira",tag:"walk-event"};
const dbs:DatabaseSync[]=[];
afterEach(()=>dbs.splice(0).forEach(db=>db.close()));
function fixture(at:number,quietStart:string|null="22:00",quietEnd:string|null="07:00"){
 const db=new DatabaseSync(":memory:");dbs.push(db);let now=at;const store=new WebPushStore(db,()=>now),deliver=vi.fn(async()=>({statusCode:201}));
 store.save(owner,{id:deviceId,label:"Phone",endpoint:"https://fcm.googleapis.com/fcm/send/secret",p256dh:"c".repeat(65),auth:"d".repeat(22),preferences:{walkReminders:true,workflowUpdates:true,quietStart,quietEnd,timeZone:"UTC"}});
 return {store,deliver,service:new WebNotificationService(store,deliver as never,()=>now),setNow:(value:number)=>{now=value;}};
}
describe("website and push notification delivery",()=>{
 it("recognizes wrapped quiet hours in the saved device time zone",()=>{const preferences={walkReminders:true,workflowUpdates:true,quietStart:"22:00",quietEnd:"07:00",timeZone:"UTC"};expect(inQuietHours(preferences,Date.parse("2026-10-29T23:00:00Z")/1000)).toBe(true);expect(inQuietHours(preferences,Date.parse("2026-10-29T12:00:00Z")/1000)).toBe(false);});
 it("defers during quiet hours, then sends one alert across retries",async()=>{const late=Date.parse("2026-10-29T23:00:00Z")/1000,f=fixture(late);expect(await f.service.send(candidate)).toMatchObject({created:true,sent:0,deferred:1});expect(f.deliver).not.toHaveBeenCalled();f.setNow(Date.parse("2026-10-30T08:00:00Z")/1000);expect(await f.service.send(candidate)).toMatchObject({created:false,sent:1});expect(await f.service.send(candidate)).toMatchObject({created:false,sent:0});expect(f.deliver).toHaveBeenCalledTimes(1);expect(f.store.listNotices(owner)).toEqual([expect.objectContaining({pushState:"sent"})]);});
 it("retains a failed notice and schedules a bounded retry",async()=>{const f=fixture(Date.parse("2026-10-29T12:00:00Z")/1000,null,null);f.deliver.mockRejectedValueOnce(new Error("offline"));expect(await f.service.send(candidate)).toMatchObject({created:true,failed:1});expect(f.store.listNotices(owner)[0].pushState).toBe("failed");expect(f.store.delivery(f.store.listNotices(owner)[0].id,deviceId)).toMatchObject({state:"failed",attempts:1});});
});
