import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it} from "vitest";
import {SponsorInvitationStore} from "./sponsor-invitation-store";
const dbs:DatabaseSync[]=[];afterEach(()=>{for(const db of dbs.splice(0))db.close();});
const cityId="00000000-0000-4000-8000-000000000001",host="ab".repeat(32),token="cd".repeat(32),id="10000000-0000-4000-8000-000000000001";
function fixture(){const db=new DatabaseSync(":memory:");dbs.push(db);return new SponsorInvitationStore(db,()=>1_800_000_000);}
describe("sponsor host invitations",()=>{
 it("stores only the token hash and resolves an active exact-city capability",()=>{const store=fixture(),row=store.create({id,token,cityId,cityName:"Madeira",hostPubkey:host,payoutVersion:2,expiresAt:1_800_086_400,authorizationEvent:"signed"});expect(row).toMatchObject({cityId,hostPubkey:host,payoutVersion:2,revokedAt:null});expect(store.resolve(token,cityId)).toEqual(row);expect(store.resolve(token,"00000000-0000-4000-8000-000000000002")).toBeNull();expect(JSON.stringify(store.db.prepare("SELECT * FROM sponsorship_invitation").get())).not.toContain(token);});
 it("revokes idempotently without deleting audit history",()=>{const store=fixture();store.create({id,token,cityId,cityName:"Madeira",hostPubkey:host,payoutVersion:2,expiresAt:1_800_086_400,authorizationEvent:"signed"});expect(store.revoke(id,host).revokedAt).toBe(1_800_000_000);expect(store.revoke(id,host).revokedAt).toBe(1_800_000_000);expect(store.resolve(token)).toBeNull();expect(store.list(host)).toHaveLength(1);});
 it("rejects unsafe expiry, wrong hosts and conflicting retries",()=>{const store=fixture();expect(()=>store.create({id,token,cityId,cityName:"Madeira",hostPubkey:host,payoutVersion:2,expiresAt:1_800_000_100,authorizationEvent:"signed"})).toThrow("expiry");store.create({id,token,cityId,cityName:"Madeira",hostPubkey:host,payoutVersion:2,expiresAt:1_800_086_400,authorizationEvent:"signed"});expect(()=>store.create({id,token:"ef".repeat(32),cityId,cityName:"Madeira",hostPubkey:host,payoutVersion:2,expiresAt:1_800_086_400,authorizationEvent:"signed"})).toThrow("conflict");expect(()=>store.revoke(id,"ef".repeat(32))).toThrow("not found");});
});
