import {describe, expect, it} from "vitest";
import type {ProvisionConfig} from "./contract";
import {createCityActivation, verifyCityActivation} from "./activation-contract";

const reserved: ProvisionConfig = {cityId:"00000000-0000-4000-8000-000000000001",version:1,domain:"bitcoinwalk.org",localPart:"madeira",
  brandPubkey:"a".repeat(64),authorityEventId:"b".repeat(64),approvalEventId:"c".repeat(64),brandEventId:"d".repeat(64),payoutVersion:2,
  payoutDestination:"organizer@example.org",walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"};

describe("city address activation contract",()=>{
  it("creates one exact versioned enable transition",()=>{
    const active=createCityActivation(reserved);
    expect(active).toEqual({...reserved,version:2,invoiceIssuance:"enabled"});
    expect(verifyCityActivation(reserved,active)).toEqual(active);
  });
  it("rejects activation that changes authority, identity, address, payout or wallet facts",()=>{
    const active=createCityActivation(reserved);
    for(const changed of [
      {...active,localPart:"madeira-two"},
      {...active,brandPubkey:"e".repeat(64)},
      {...active,approvalEventId:"e".repeat(64)},
      {...active,payoutVersion:3},
      {...active,payoutDestination:"other@example.org"},
      {...active,walletRef:"other-wallet"},
    ]) expect(()=>verifyCityActivation(reserved,changed)).toThrow("does not exactly follow");
  });
  it("rejects skipped, repeated, disabled and exhausted transitions",()=>{
    const active=createCityActivation(reserved);
    for(const changed of [{...active,version:1},{...active,version:3},{...active,invoiceIssuance:"disabled"}])
      expect(()=>verifyCityActivation(reserved,changed as ProvisionConfig)).toThrow();
    expect(()=>createCityActivation({...reserved,version:Number.MAX_SAFE_INTEGER})).toThrow("version exhausted");
  });
});
