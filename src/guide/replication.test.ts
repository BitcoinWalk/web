import {describe,expect,it,vi} from "vitest";
import {generateSecretKey,verifyEvent} from "nostr-tools";
import {parseMediaRequest} from "../domain/media-request";
import {readGuideReplicationStatus} from "./replication";

const report={version:1,state:"healthy",reconciled:true,cities:[{cityId:"586c0d1f-e861-4c8f-858c-ce3e2bfaf384",destination:"wss://replica.example.com/",state:"healthy",counts:{revoked:2}}]};
describe("Guide replication status client",()=>{
 it("uses a fresh signed, narrowly scoped loopback request",async()=>{const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({report,checkedAt:new Date().toISOString()}),{status:200}));await expect(readGuideReplicationStatus(generateSecretKey(),request)).resolves.toEqual(report);const [url,init]=request.mock.calls[0],event=JSON.parse(init.body).event;expect(url).toBe("http://127.0.0.1:3338/api/replication/status");expect(verifyEvent(event)).toBe(true);expect(parseMediaRequest(event)).toEqual({action:"list-replication-status"});});
 it("rejects any extra event identifier in the response",async()=>{const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({report:{...report,eventId:"a".repeat(64)},checkedAt:new Date().toISOString()}),{status:200}));await expect(readGuideReplicationStatus(generateSecretKey(),request)).rejects.toThrow();});
});
