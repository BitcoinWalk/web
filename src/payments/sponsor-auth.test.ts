import {finalizeEvent} from "nostr-tools";
import {describe,it,expect} from "vitest";
import {sponsorRequest,authorizeSponsor} from "./sponsor-auth";
describe("sponsor identity association",()=>{
 it("binds the signature to the exact order, action and site",()=>{const origin="https://app-staging.bitcoinwalk.org",event=finalizeEvent(sponsorRequest("claim",origin,"order-1"),new Uint8Array(32).fill(1));expect(authorizeSponsor(event,origin,"claim","order-1")).toBe(event.pubkey);expect(()=>authorizeSponsor(event,origin,"claim","order-2")).toThrow();expect(()=>authorizeSponsor(event,origin,"list")).toThrow();expect(()=>authorizeSponsor(event,"https://other.example","claim","order-1")).toThrow();});
});
