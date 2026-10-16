import {generateSecretKey,getPublicKey,finalizeEvent} from "nostr-tools";
import {describe,expect,it,vi} from "vitest";
import {authorizeSponsorInvitation,sponsorInvitationRequest} from "./sponsor-invitation-auth";

describe("sponsor invitation authorization",()=>{
 it("binds a fresh signature to the exact origin, action, city, walk, token hash and expiry",()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));try{const secret=generateSecretKey(),command={action:"create" as const,id:"10000000-0000-4000-8000-000000000001",cityId:"20000000-0000-4000-8000-000000000002",walkId:"b".repeat(64),tokenHash:"a".repeat(64),expiresAt:1893459600},event=finalizeEvent(sponsorInvitationRequest("https://bitcoinwalk.org",command),secret);expect(authorizeSponsorInvitation(event,"https://bitcoinwalk.org",command)).toBe(getPublicKey(secret));expect(()=>authorizeSponsorInvitation(event,"https://app-staging.bitcoinwalk.org",command)).toThrow();expect(()=>authorizeSponsorInvitation(event,"https://bitcoinwalk.org",{...command,cityId:"30000000-0000-4000-8000-000000000003"})).toThrow();expect(()=>authorizeSponsorInvitation(event,"https://bitcoinwalk.org",{...command,walkId:"c".repeat(64)})).toThrow();}finally{vi.useRealTimers();}});
});
