import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {DatabaseSync} from "node:sqlite";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {POST} from "./route";
import {idleCommandTemplate,type IdleCommand} from "../../../guide/idle-contract";
import {getPaymentRuntime} from "../../../payments/runtime";
import {queryAuthorizations} from "../../../nostr/city-records";
vi.mock("../../../payments/runtime",()=>({getPaymentRuntime:vi.fn()}));
vi.mock("../../../nostr/city-records",()=>({queryAuthorizations:vi.fn()}));
const secret=generateSecretKey(),owner=getPublicKey(secret),other=generateSecretKey(),city="10000000-0000-4000-8000-000000000001",origin="https://bitcoinwalk.org";
let db:DatabaseSync;
beforeEach(()=>{vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN",origin);db=new DatabaseSync(":memory:");vi.mocked(getPaymentRuntime).mockReturnValue({store:{db}} as never);vi.mocked(queryAuthorizations).mockResolvedValue([{event:{created_at:1,id:"a".repeat(64)},grant:{cityId:city,creatorPubkey:getPublicKey(other),ownerPubkey:owner}}] as never);});
afterEach(()=>{db.close();vi.unstubAllEnvs();vi.clearAllMocks();});
async function request(command:IdleCommand,key=secret,site=origin){const event=finalizeEvent(idleCommandTemplate(command,origin),key);return POST(new Request(`${origin}/api/guide-reminders`,{method:"POST",headers:{origin:site,"Content-Type":"application/json"},body:JSON.stringify({event})}));}
describe("idle reminder API",()=>{
 it("lets only the current owner read or save, never the original owner/editor",async()=>{expect((await request({action:"read",cityId:city},other)).status).toBe(403);const result=await request({action:"save",cityId:city,choice:"off",version:0});expect(result.status).toBe(200);expect(await result.json()).toMatchObject({paused:true,preference:{enabled:false,version:1}});});
 it("refuses cross-origin requests and stale preference versions",async()=>{expect((await request({action:"read",cityId:city},secret,"https://other.example")).status).toBe(403);const command={action:"save" as const,cityId:city,choice:"90" as const,version:0};expect((await request(command)).status).toBe(200);expect((await request(command)).status).toBe(503);});
 it("fails closed if current ownership cannot be read",async()=>{vi.mocked(queryAuthorizations).mockRejectedValue(new Error("relay unavailable"));expect((await request({action:"save",cityId:city,choice:"on",version:0})).status).toBe(503);expect(db.prepare("SELECT name FROM sqlite_master WHERE name='guide_idle_preference'").get()).toBeUndefined();});
});
