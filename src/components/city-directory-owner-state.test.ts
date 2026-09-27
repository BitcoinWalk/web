import type {Event} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {directoryRootResultHeading,planDirectoryRootSubmission} from "./city-directory-owner-state";

const root={id:"d16d969d0bf77c1a71453005b551ab7e2693d293888c2119928df93a69b21a79",pubkey:"4506e04e4b7079ce07e38e9875678a81ad33a456c696d708ef8e9a2d8c16ba04"} as Event;

describe("directory root owner submission state",()=>{
  it("verifies an existing root without entering the signing path during a partial outage",()=>{
    const plan=planDirectoryRootSubmission({root,reachableRelays:["wss://directory-staging.bitcoinwalk.org/"],unavailableRelays:["wss://directory-2-staging.bitcoinwalk.org/"]});
    expect(plan).toEqual({kind:"verify-existing",event:root});
    expect(plan.kind).not.toBe("create");
    expect(directoryRootResultHeading("verified")).toBe("Existing trust anchor verified");
  });

  it("distinguishes recovery of an existing event from creation of a new root",()=>{
    expect(planDirectoryRootSubmission({root,reachableRelays:["wss://one.example/","wss://two.example/"],unavailableRelays:[]})).toEqual({kind:"recover-existing",event:root});
    expect(planDirectoryRootSubmission({root:null,reachableRelays:["wss://one.example/","wss://two.example/"],unavailableRelays:[]})).toEqual({kind:"create"});
    expect(directoryRootResultHeading("recovered")).toBe("Existing trust anchor recovered");
    expect(directoryRootResultHeading("created")).toBe("Trust anchor created");
  });
});
