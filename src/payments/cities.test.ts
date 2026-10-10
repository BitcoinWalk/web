import {beforeEach,describe,expect,it,vi} from "vitest";
import {verifyGiftableCity,verifyPurchasableCity} from "./cities";
import {queryDirectoryRecords,queryCityAuthorization} from "../nostr/city-records";
vi.mock("../nostr/city-records",()=>({queryDirectoryRecords:vi.fn(),queryCityAuthorization:vi.fn()}));
const id="be8514a4-9df0-4159-a517-71f65761cbbe",owner="a".repeat(64),revision="b".repeat(64);
const city={cityId:id,cityName:"Memphis",requestedTier:"paid"};
const records=()=>({revisions:[{city,event:{id:revision,pubkey:owner,created_at:1}}],approvals:[]});
// These fixtures sit behind the signature-validating relay parsers.
function seed(value:unknown){vi.mocked(queryDirectoryRecords).mockResolvedValue(value as Awaited<ReturnType<typeof queryDirectoryRecords>>);}
beforeEach(()=>{vi.clearAllMocks();seed(records());vi.mocked(queryCityAuthorization).mockResolvedValue(null);});
describe("city purchase eligibility",()=>{
 it("binds a new request to its relay-accepted original author",async()=>{expect(await verifyPurchasableCity(["wss://test"],id,revision)).toEqual({cityId:id,cityName:"Memphis",owner,revisionId:revision});});
 it("rejects an unknown revision",async()=>{await expect(verifyPurchasableCity(["wss://test"],id,"f".repeat(64))).rejects.toThrow();});
 it("rejects a free request",async()=>{seed({revisions:[{city:{...city,requestedTier:"free"},event:{id:revision,pubkey:owner,created_at:1}}],approvals:[]});await expect(verifyPurchasableCity([],id,revision)).rejects.toThrow();});
 it("rejects an editor purchasing as another city's creator",async()=>{vi.mocked(queryCityAuthorization).mockResolvedValue({grant:{creatorPubkey:"c".repeat(64)}} as Awaited<ReturnType<typeof queryCityAuthorization>>);await expect(verifyPurchasableCity([],id,revision)).rejects.toThrow();});
 it.each(["revoked","rejected"])("rejects %s city requests",async status=>{seed({...records(),approvals:[{event:{id:"c".repeat(64),created_at:2},approval:{cityId:id,cityRevisionId:revision,status}}]});await expect(verifyPurchasableCity([],id,revision)).rejects.toThrow();});
 it("allows the creator to purchase a newer paid revision after an older revision was rejected",async()=>{const newer="d".repeat(64);seed({revisions:[{city,event:{id:revision,pubkey:owner,created_at:1}},{city,event:{id:newer,pubkey:owner,created_at:3}}],approvals:[{event:{id:"c".repeat(64),created_at:2},approval:{cityId:id,cityRevisionId:revision,status:"rejected"}}]});expect(await verifyPurchasableCity([],id,newer)).toMatchObject({revisionId:newer,owner});});
 it("accepts a reapproved city after an older revocation",async()=>{seed({...records(),approvals:[{event:{id:"c".repeat(64),created_at:2},approval:{cityId:id,cityRevisionId:revision,status:"revoked"}},{event:{id:"d".repeat(64),created_at:3},approval:{cityId:id,cityRevisionId:revision,status:"approved"}}]});expect(await verifyPurchasableCity([],id,revision)).toMatchObject({revisionId:revision});});
 it("fails closed when the authoritative relay is unavailable",async()=>{vi.mocked(queryDirectoryRecords).mockRejectedValue(new Error("offline"));await expect(verifyPurchasableCity([],id,revision)).rejects.toThrow();});
});
describe("public gift eligibility",()=>{
 it("binds an exact approved Basic revision to its durable creator",async()=>{
  seed({revisions:[{city:{...city,requestedTier:"free"},event:{id:revision,pubkey:owner,created_at:1}}],approvals:[{event:{id:"c".repeat(64),created_at:2},approval:{cityId:id,cityRevisionId:revision,status:"approved",slug:"memphis"}}]});
  vi.mocked(queryCityAuthorization).mockResolvedValue({grant:{creatorPubkey:owner}} as Awaited<ReturnType<typeof queryCityAuthorization>>);
  expect(await verifyGiftableCity([],id,revision)).toEqual({cityId:id,cityName:"Memphis",owner,revisionId:revision});
 });
 it("rejects a Pro request, stale revision or unverifiable owner",async()=>{
  seed({revisions:[{city,event:{id:revision,pubkey:owner,created_at:1}}],approvals:[{event:{id:"c".repeat(64),created_at:2},approval:{cityId:id,cityRevisionId:revision,status:"approved",slug:"memphis"}}]});
  await expect(verifyGiftableCity([],id,revision)).rejects.toThrow();
 });
});
