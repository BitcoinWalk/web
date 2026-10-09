import {mkdtempSync,rmSync} from "node:fs";
import {createServer,type Server} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {finalizeEvent,generateSecretKey,type Event} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
import {ReceiptRelayEgressClient,receiptRelayEgressHandler} from "./receipt-relay-egress";

const token="a".repeat(43),relay="wss://nos.lol/";
const directories:string[]=[];const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});});
function fixture(published=[relay]){
 const secret=generateSecretKey(),event=finalizeEvent({kind:9735,created_at:1,content:"",tags:[]},secret),publisher={publish:vi.fn(async()=>published)};
 const directory=mkdtempSync(join(tmpdir(),"receipt-egress-")),socket=join(directory,"relay.sock"),server=createServer(receiptRelayEgressHandler(event.pubkey,publisher,token));directories.push(directory);servers.push(server);
 return new Promise<{client:ReceiptRelayEgressClient;event:Event;publisher:typeof publisher;socket:string}>(resolve=>server.listen(socket,()=>resolve({client:new ReceiptRelayEgressClient(socket,token),event,publisher,socket})));
}
describe("receipt relay egress",()=>{
 it("publishes only a valid receipt from the pinned provider",async()=>{const f=await fixture();await expect(f.client.publish([relay],f.event)).resolves.toEqual([relay]);expect(f.publisher.publish).toHaveBeenCalledWith([relay],expect.objectContaining({id:f.event.id,pubkey:f.event.pubkey,kind:9735}));});
 it("returns an empty acknowledgement set for durable retry",async()=>{const f=await fixture([]);await expect(f.client.publish([relay],f.event)).resolves.toEqual([]);});
 it("rejects a wrong capability",async()=>{const f=await fixture(),client=new ReceiptRelayEgressClient(f.socket,"b".repeat(43));await expect(client.publish([relay],f.event)).rejects.toThrow("Receipt relay egress rejected");expect(f.publisher.publish).not.toHaveBeenCalled();});
 it("rejects a valid event from another provider",async()=>{const f=await fixture();const event=finalizeEvent({kind:9735,created_at:1,content:"",tags:[]},generateSecretKey());await expect(f.client.publish([relay],event)).rejects.toThrow("Receipt relay egress rejected");expect(f.publisher.publish).not.toHaveBeenCalled();});
 it("rejects a forged receipt before publication",async()=>{const f=await fixture(),event={...f.event,id:"0".repeat(64)};await expect(f.client.publish([relay],event)).rejects.toThrow("Receipt relay egress rejected");expect(f.publisher.publish).not.toHaveBeenCalled();});
 it("rejects a relay response outside the request",async()=>{const f=await fixture(["wss://relay.damus.io/"]);await expect(f.client.publish([relay],f.event)).rejects.toThrow("Receipt relay egress rejected");});
});
