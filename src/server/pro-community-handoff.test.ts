import {beforeEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";

const ownerA="a".repeat(64),ownerB="b".repeat(64),ownerC="c".repeat(64),ownerD="d".repeat(64);
vi.mock("server-only",()=>({}));
const database=vi.hoisted(()=>({prepare:vi.fn()}));
const queryRelayEvents=vi.hoisted(()=>vi.fn());
vi.mock("../payments/runtime",()=>({getPaymentRuntime:()=>({store:{db:database}})}));
vi.mock("../nostr/city-records",()=>({queryRelayEvents}));
vi.mock("./chat-config",()=>({serverChatConfig:()=>({environment:"staging",global:null,paidCities:{
 a:{slug:"a",tier:"pro",destination:null,walkieTalkieDestination:{relay:"wss://chat.bitcoinwalk.org/",groupId:"bitcoinwalk-a"},walkieTalkieEnabled:true},
 b:{slug:"b",tier:"pro",destination:null,walkieTalkieDestination:{relay:"wss://chat.bitcoinwalk.org/",groupId:"bitcoinwalk-b"},walkieTalkieEnabled:true},
 c:{slug:"c",tier:"pro",destination:null,walkieTalkieDestination:{relay:"wss://chat.bitcoinwalk.org/",groupId:"bitcoinwalk-c"},walkieTalkieEnabled:true},
 d:{slug:"d",tier:"pro",destination:null,walkieTalkieDestination:null,walkieTalkieEnabled:false},
}})}));
import {loadProCommunityHandoffOutcomes} from "./pro-community-handoff";
import type {CityIdentityHealth} from "./pro-city-identity-health";

const health=(cityId:string):CityIdentityHealth=>({cityId,cityName:"Private",slug:cityId,availableInEnvironment:true,tier:"pro",status:"complete",checkedAt:100,checks:[]});

describe("Pro community handoff evidence",()=>{
 beforeEach(()=>{vi.resetAllMocks();database.prepare.mockImplementation((sql:string)=>sql.includes("sqlite_master")?{get:()=>({ok:1})}:{all:()=>[{cityId:"a",currentOwnerPubkey:ownerA},{cityId:"b",currentOwnerPubkey:ownerB},{cityId:"c",currentOwnerPubkey:ownerC},{cityId:"d",currentOwnerPubkey:ownerD}]});queryRelayEvents.mockResolvedValue([finalizeEvent({kind:39002,created_at:100,tags:[["d","bitcoinwalk-a"],["p",ownerA]],content:""},generateSecretKey()),finalizeEvent({kind:39002,created_at:100,tags:[["d","bitcoinwalk-b"]],content:""},generateSecretKey())]);});
 it("uses exact signed rosters and makes missing evidence unknown instead of successful",async()=>{expect(await loadProCommunityHandoffOutcomes(SUPER_ADMIN_PUBKEY,[health("a"),health("b"),health("c"),health("d")],101)).toEqual({checked:4,confirmed:1,actionRequired:2,unknown:1,checkedAt:101});});
 it("rejects non-super-admin reads before touching private state",async()=>{await expect(loadProCommunityHandoffOutcomes(ownerA,[health("a")],101)).rejects.toThrow("Super-admin");expect(database.prepare).not.toHaveBeenCalled();});
});
