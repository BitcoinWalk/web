import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {EventEmitter} from "node:events";
import {finalizeEvent,generateSecretKey} from "nostr-tools";
import {mediaRequestTemplate} from "../domain/media-request";
const mocks=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock("node:dns/promises",()=>({lookup:mocks.lookup}));
vi.mock("node:https",()=>({request:mocks.request}));
import {chatUploadMembershipEndpoint,requireChatUploadMembership} from "./chat-upload-membership";
const relay="wss://chat-staging.bitcoinwalk.org/";
const event=()=>finalizeEvent(mediaRequestTemplate({action:"upload-chat-image",relay,groupId:"city-a",sha256:"a".repeat(64),mime:"image/png",bytes:100}),generateSecretKey());
function response(status:number,body:string,type="application/json"){
 mocks.request.mockImplementation((_options,callback)=>{
  const request=new EventEmitter() as EventEmitter&{end:(body:string)=>void};
  request.end=()=>queueMicrotask(()=>{const res=Object.assign(new EventEmitter(),{statusCode:status,headers:{"content-type":type},destroy:vi.fn()});callback(res);res.emit("data",Buffer.from(body));res.emit("end");});return request;
 });
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("BITCOINWALK_CHAT_UPLOAD_MEMBERSHIP","required");vi.stubEnv("BITCOINWALK_CHAT_UPLOAD_RELAYS",JSON.stringify([relay]));mocks.lookup.mockResolvedValue([{address:"8.8.8.8",family:4}]);});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
describe("upload membership",()=>{
 it("requires an exact allowlist, not the BitcoinWalk suffix",()=>{expect(chatUploadMembershipEndpoint(relay)?.href).toBe("https://chat-staging.bitcoinwalk.org/api/chat/upload-authorization");expect(()=>chatUploadMembershipEndpoint("wss://other.bitcoinwalk.org")).toThrow();});
 it.each(["wss://chat-staging.bitcoinwalk.org.evil.test/","wss://chat-staging.bitcoinwalk.org:123/","wss://user@chat-staging.bitcoinwalk.org/","wss://chat-staging.bitcoinwalk.org/path"])("rejects %s",value=>expect(()=>chatUploadMembershipEndpoint(value)).toThrow());
 it("retains rollout compatibility only when unset",async()=>{vi.stubEnv("BITCOINWALK_CHAT_UPLOAD_MEMBERSHIP","");await requireChatUploadMembership(event());expect(mocks.lookup).not.toHaveBeenCalled();vi.stubEnv("BITCOINWALK_CHAT_UPLOAD_MEMBERSHIP","typo");await expect(requireChatUploadMembership(event())).rejects.toMatchObject({status:503});});
 it("fails closed without a configured relay list",async()=>{vi.stubEnv("BITCOINWALK_CHAT_UPLOAD_RELAYS","[]");await expect(requireChatUploadMembership(event())).rejects.toMatchObject({status:503});});
 it("pins DNS and accepts only event-bound approval without caching",async()=>{const e=event();response(200,JSON.stringify({allowed:true,eventId:e.id}));await requireChatUploadMembership(e);expect(mocks.request.mock.calls[0][0]).toMatchObject({hostname:"8.8.8.8",servername:"chat-staging.bitcoinwalk.org",method:"POST"});response(403,"denied");await expect(requireChatUploadMembership(e)).rejects.toMatchObject({status:403});});
 it.each(["127.0.0.1","10.0.0.1","169.254.169.254","192.168.1.1","100.64.0.1","::1"])("rejects private address %s",async address=>{mocks.lookup.mockResolvedValue([{address}]);await expect(requireChatUploadMembership(event())).rejects.toMatchObject({status:503});expect(mocks.request).not.toHaveBeenCalled();});
 it.each([[302,"{}"],[500,"{}"],[200,"{"],[200,JSON.stringify({allowed:true,eventId:"wrong"})],[200,"x".repeat(4097)]])("fails closed for response %s",async(status,body)=>{response(Number(status),String(body));await expect(requireChatUploadMembership(event())).rejects.toMatchObject({status:503});});
 it("bounds DNS wait and never starts a late request",async()=>{vi.useFakeTimers();let finish!:(value:unknown)=>void;mocks.lookup.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const pending=expect(requireChatUploadMembership(event())).rejects.toMatchObject({status:503});await vi.advanceTimersByTimeAsync(5001);await pending;finish([{address:"8.8.8.8"}]);await Promise.resolve();expect(mocks.request).not.toHaveBeenCalled();});
});
