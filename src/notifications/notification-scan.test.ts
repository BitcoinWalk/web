import {DatabaseSync} from "node:sqlite";
import {nip19} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {scanCandidates} from "./notification-scan";
import {WebPushStore} from "./web-push-store";

const dbs:DatabaseSync[]=[],owner="a".repeat(64),city="10000000-0000-4000-8000-000000000009",event="b".repeat(64),now=1_800_000_000;
afterEach(()=>dbs.splice(0).forEach(db=>db.close()));
describe("real notification candidate scan",()=>{
 it("selects only opted-in owner walks within 24 hours and durable Pro actions",()=>{const db=new DatabaseSync(":memory:");dbs.push(db);const store=new WebPushStore(db,()=>now);store.save(owner,{id:"10000000-0000-4000-8000-000000000001",label:"Phone",endpoint:"https://fcm.googleapis.com/fcm/send/secret",p256dh:"c".repeat(65),auth:"d".repeat(22),preferences:{walkReminders:true,workflowUpdates:true,quietStart:null,quietEnd:null,timeZone:"UTC"}});db.exec("CREATE TABLE pro_setup_task(cityId TEXT,entitlementId TEXT,currentOwnerPubkey TEXT,state TEXT,createdAt INTEGER);CREATE TABLE payment_invoice(id TEXT,cityName TEXT)");db.prepare("INSERT INTO pro_setup_task VALUES(?,?,?,?,?)").run(city,"invoice",owner,"setup-required",now);db.prepare("INSERT INTO payment_invoice VALUES(?,?)").run("invoice","Madeira");const feed={version:1 as const,generatedAt:new Date(now*1000).toISOString(),events:[{id:event,name:"BitcoinWalk Madeira",description:"Walk",startDate:new Date((now+3600)*1000).toISOString(),timeZone:"Atlantic/Madeira",link:`https://app-staging.bitcoinwalk.org/madeira/event`,organizerNpub:nip19.npubEncode(owner),address:"Park",latitude:1,longitude:1,image:"https://example.com/image.jpg"},{id:"c".repeat(64),name:"Later",description:"Walk",startDate:new Date((now+2*86400)*1000).toISOString(),timeZone:"UTC",link:"https://app-staging.bitcoinwalk.org/later/event",organizerNpub:nip19.npubEncode(owner),address:"Later",latitude:1,longitude:1,image:"https://example.com/image.jpg"}]};const candidates=scanCandidates(store,feed,now);expect(candidates.map(value=>value.dedupeKey)).toEqual([`pro:${city}:confirm-payout`,`walk-24h:${event}`]);expect(candidates.every(value=>value.ownerPubkey===owner)).toBe(true);});
});
