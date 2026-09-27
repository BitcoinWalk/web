import {afterEach,describe,expect,it} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {mediaRequestTemplate} from "../domain/media-request";
import {isReplicationStatusRequester} from "./replication-status-auth";

const guide=generateSecretKey(),other=generateSecretKey();
afterEach(()=>{delete process.env.BITCOINWALK_GUIDE_PUBKEY;});
describe("replication status request authority",()=>{
 it("accepts only the configured Guide identity for the exact read-only action",()=>{process.env.BITCOINWALK_GUIDE_PUBKEY=getPublicKey(guide);expect(isReplicationStatusRequester(finalizeEvent(mediaRequestTemplate({action:"list-replication-status"}),guide))).toBe(true);expect(isReplicationStatusRequester(finalizeEvent(mediaRequestTemplate({action:"list-replication-status"}),other))).toBe(false);expect(isReplicationStatusRequester(finalizeEvent(mediaRequestTemplate({action:"list-media-alerts"}),guide))).toBe(false);});
 it("fails closed when Guide identity is missing or malformed",()=>{const event=finalizeEvent(mediaRequestTemplate({action:"list-replication-status"}),guide);expect(isReplicationStatusRequester(event)).toBe(false);process.env.BITCOINWALK_GUIDE_PUBKEY="not-a-key";expect(isReplicationStatusRequester(event)).toBe(false);});
});
