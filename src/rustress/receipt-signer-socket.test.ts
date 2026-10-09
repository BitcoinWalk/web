import {createHash,randomBytes} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {createServer,type Server} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {encode,sign as signBolt} from "bolt11";
import {finalizeEvent,getPublicKey,type EventTemplate} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
import {ReceiptSignerStore} from "./receipt-signer";
import {receiptSignerHandler,ReceiptSignerSocketClient} from "./receipt-signer-socket";

const servers:Server[]=[];const paths:string[]=[];const dbs:DatabaseSync[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));dbs.splice(0).forEach(db=>db.close());paths.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true}));});
const key=new Uint8Array(32).fill(3),pubkey=getPublicKey(key),token=randomBytes(32).toString("base64url"),now=1_800_000_000,preimage="12".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
function receipt(){const payer=new Uint8Array(32).fill(2),recipient=getPublicKey(new Uint8Array(32).fill(4)),zap=finalizeEvent({kind:9734,created_at:now-10,content:"",tags:[["relays","wss://one.example"],["amount","100000"],["p",recipient],["P",pubkey]]},payer),raw=JSON.stringify(zap),descriptionHash=createHash("sha256").update(raw).digest("hex"),invoice=signBolt(encode({millisatoshis:"100000",timestamp:now-60,tags:[{tagName:"payment_hash",data:hash},{tagName:"purpose_commit_hash",data:descriptionHash}]}),"34".repeat(32)).paymentRequest!;return {kind:9735,created_at:now,content:"",tags:[["p",recipient],["P",zap.pubkey],["bolt11",invoice],["description",raw],["preimage",preimage]]} satisfies EventTemplate;}
async function fixture(clientToken=token){
 const directory=mkdtempSync(join(tmpdir(),"bw-signer-")),socket=join(directory,"signer.sock"),db=new DatabaseSync(":memory:"),sign=vi.fn(async(template:EventTemplate)=>finalizeEvent(template,key)),store=new ReceiptSignerStore(db,pubkey,sign,()=>now),server=createServer(receiptSignerHandler(store,token));
 paths.push(directory);dbs.push(db);servers.push(server);await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(socket,resolve);});
 return {client:new ReceiptSignerSocketClient(pubkey,socket,clientToken),sign};
}
describe("receipt signer Unix socket",()=>{
 it("returns and reuses one exact signature without exposing the key",async()=>{const f=await fixture(),template=receipt(),first=await f.client.sign(template),second=await f.client.sign(template);expect(second).toEqual(first);expect(first.pubkey).toBe(pubkey);expect(f.sign).toHaveBeenCalledTimes(1);});
 it("rejects the wrong capability token",async()=>{const f=await fixture(randomBytes(32).toString("base64url"));await expect(f.client.sign(receipt())).rejects.toThrow();expect(f.sign).not.toHaveBeenCalled();});
 it("rejects a changed or malformed template before signing",async()=>{const f=await fixture(),template=receipt();template.tags[0][1]="ff".repeat(32);await expect(f.client.sign(template)).rejects.toThrow();expect(f.sign).not.toHaveBeenCalled();});
});
