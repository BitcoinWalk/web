import {DatabaseSync} from "node:sqlite";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("../nostr/madeira-pilot-policy",async original=>{const real=await original<typeof import("../nostr/madeira-pilot-policy")>();return {MADEIRA_PILOT:{...real.MADEIRA_PILOT,pubkey:getPublicKey(new Uint8Array(32).fill(2))}};});
vi.mock("../nostr/authority",async()=>({SUPER_ADMIN_PUBKEY:(await import("nostr-tools")).getPublicKey(new Uint8Array(32).fill(1))}));
import {MADEIRA_PILOT} from "../nostr/madeira-pilot";
import {madeiraManagedActivationProofTemplate} from "../nostr/madeira-managed-activation";
import {createCityActivation} from "./activation-contract";
import {MadeiraManagedActivationStore} from "./madeira-managed-activation-store";
import type {ProvisionConfig} from "./contract";

const owner=new Uint8Array(32).fill(2),admin=new Uint8Array(32).fill(1),revision="d".repeat(64),databases:DatabaseSync[]=[];
const reserved:ProvisionConfig={cityId:MADEIRA_PILOT.cityId,version:1,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:getPublicKey(owner),
  authorityEventId:"a".repeat(64),approvalEventId:"b".repeat(64),brandEventId:"c".repeat(64),payoutVersion:1,payoutDestination:"owner@example.org",
  walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"};
afterEach(()=>databases.splice(0).forEach(db=>db.close()));
function fixture(){const db=new DatabaseSync(":memory:");databases.push(db);let now=1000,source={requestId:"00000000-0000-4000-8000-000000000002",reserved,proofHash:"e".repeat(64)};
  const read=vi.fn(async()=>source),store=new MadeiraManagedActivationStore(db,read,revision,()=>now);
  return {db,store,read,change:()=>{source={...source,proofHash:"f".repeat(64)};},advance:()=>now+=3601};}

describe("Madeira managed public activation grant",()=>{
  it("requires distinct owner and admin consent for the exact enabled transition",async()=>{const f=fixture(),view=(await f.store.prepare())!;
    expect(view.challenge).toMatchObject({nip05:"madeira@bitcoinwalk.org",lightningAddress:"madeira@bitcoinwalk.org",publicActivation:true,
      reserved:{invoiceIssuance:"disabled",payoutDestination:"owner@example.org"},activation:{invoiceIssuance:"enabled",version:2}});
    const op=finalizeEvent(madeiraManagedActivationProofTemplate(view.challenge,"owner"),owner),ap=finalizeEvent(madeiraManagedActivationProofTemplate(view.challenge,"admin"),admin);
    await expect(f.store.accept("admin",ap)).rejects.toThrow("authorize");await f.store.accept("owner",op);await f.store.accept("admin",ap);
    const evidence=await f.store.evidence(view.challenge.requestId);expect(evidence).toMatchObject({reserved,activation:createCityActivation(reserved),publicOrigin:"https://bitcoinwalk.org"});
    expect(evidence.proofHash).toMatch(/^[0-9a-f]{64}$/);f.advance();expect(await f.store.evidence(view.challenge.requestId)).toEqual(evidence);
  });
  it("fails closed when reservation evidence or provider revision changes",async()=>{const f=fixture(),view=(await f.store.prepare())!;
    await f.store.accept("owner",finalizeEvent(madeiraManagedActivationProofTemplate(view.challenge,"owner"),owner));f.change();
    await expect(f.store.accept("admin",finalizeEvent(madeiraManagedActivationProofTemplate(view.challenge,"admin"),admin))).rejects.toThrow("changed");
    const replacement=new MadeiraManagedActivationStore(f.db,f.read,"f".repeat(64),()=>1000);await expect(replacement.prepare()).rejects.toThrow("changed");
  });
});
