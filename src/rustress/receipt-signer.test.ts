import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {encode,sign as signBolt} from "bolt11";
import {finalizeEvent,getPublicKey,type EventTemplate} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
import {RECEIPT_SIGNER_API,ReceiptSignerStore,validateReceiptTemplate} from "./receipt-signer";

const dbs:DatabaseSync[]=[];afterEach(()=>dbs.splice(0).forEach(db=>db.close()));
const payerKey=new Uint8Array(32).fill(2),providerKey=new Uint8Array(32).fill(3),recipient=getPublicKey(new Uint8Array(32).fill(4)),provider=getPublicKey(providerKey),now=1_800_000_000,preimage="12".repeat(32),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
function fixture(){
 const zap=finalizeEvent({kind:9734,created_at:now-10,content:"Walk on!",tags:[["relays","wss://one.example"],["amount","100000"],["p",recipient],["P",provider],["e","ab".repeat(32)],["k","31923"]]},payerKey),raw=JSON.stringify(zap),descriptionHash=createHash("sha256").update(raw).digest("hex");
 const invoice=signBolt(encode({millisatoshis:"100000",timestamp:now-60,tags:[{tagName:"payment_hash",data:paymentHash},{tagName:"purpose_commit_hash",data:descriptionHash},{tagName:"expire_time",data:3600}]}),"34".repeat(32)).paymentRequest!;
 const template:EventTemplate={kind:9735,created_at:now,content:"",tags:[["p",recipient],["P",zap.pubkey],["e","ab".repeat(32)],["k","31923"],["bolt11",invoice],["description",raw],["preimage",preimage]]};
 const request={api:RECEIPT_SIGNER_API,paymentHash,template},sign=vi.fn(async(value:EventTemplate)=>finalizeEvent(value,providerKey)),db=new DatabaseSync(":memory:");dbs.push(db);
 return {request,template,sign,db,store:new ReceiptSignerStore(db,provider,sign,()=>now)};
}
describe("isolated receipt signer",()=>{
 it("independently validates and durably signs one exact receipt",async()=>{const f=fixture();expect(JSON.parse(JSON.stringify(validateReceiptTemplate(f.request,provider,now).template))).toEqual(JSON.parse(JSON.stringify(f.template)));const event=await f.store.sign(f.request);expect(event.pubkey).toBe(provider);expect(f.sign).toHaveBeenCalledTimes(1);expect(JSON.parse(JSON.stringify(await f.store.sign(f.request)))).toEqual(JSON.parse(JSON.stringify(event)));expect(f.sign).toHaveBeenCalledTimes(1);});
 it.each([
  ["recipient",(x:ReturnType<typeof fixture>)=>x.request.template.tags[0][1]="ff".repeat(32)],
  ["sender",(x:ReturnType<typeof fixture>)=>x.request.template.tags[1][1]="ff".repeat(32)],
  ["amount",(x:ReturnType<typeof fixture>)=>{const zap=JSON.parse(x.request.template.tags.at(-2)![1]);zap.tags.find((t:string[])=>t[0]==="amount")[1]="99000";x.request.template.tags.at(-2)![1]=JSON.stringify(zap);}],
  ["preimage",(x:ReturnType<typeof fixture>)=>x.request.template.tags.at(-1)![1]="56".repeat(32)],
  ["invoice",(x:ReturnType<typeof fixture>)=>x.request.paymentHash="ef".repeat(32)],
  ["provider",(x:ReturnType<typeof fixture>)=>{const zap=JSON.parse(x.request.template.tags.at(-2)![1]);zap.tags.find((t:string[])=>t[0]==="P")[1]="ef".repeat(32);x.request.template.tags.at(-2)![1]=JSON.stringify(zap);}],
  ["relays",(x:ReturnType<typeof fixture>)=>{const zap=JSON.parse(x.request.template.tags.at(-2)![1]);zap.tags.find((t:string[])=>t[0]==="relays")[1]="ws://127.0.0.1";x.request.template.tags.at(-2)![1]=JSON.stringify(zap);}],
  ["extra tag",(x:ReturnType<typeof fixture>)=>x.request.template.tags.push(["client","arbitrary"])]
 ])("rejects a mismatched %s",async(_name,change)=>{const f=fixture();change(f);await expect(f.store.sign(f.request)).rejects.toThrow("rejected");expect(f.sign).not.toHaveBeenCalled();});
 it("rejects a future timestamp and a signer that alters the template",async()=>{const f=fixture();f.request.template.created_at=now+31;await expect(f.store.sign(f.request)).rejects.toThrow();const g=fixture();g.sign.mockImplementationOnce(async value=>finalizeEvent({...value,content:"changed"},providerKey));await expect(g.store.sign(g.request)).rejects.toThrow("signature");});
 it("rejects conflicting reuse of a payment hash across restart",async()=>{const f=fixture();await f.store.sign(f.request);const restarted=new ReceiptSignerStore(f.db,provider,f.sign,()=>now),changed=structuredClone(f.request);changed.template.created_at--;await expect(restarted.sign(changed)).rejects.toThrow("conflict");});
 it("coalesces simultaneous exact requests before invoking the key",async()=>{const f=fixture();let release!:()=>void;f.sign.mockImplementationOnce(template=>new Promise(resolve=>{release=()=>resolve(finalizeEvent(template,providerKey));}));const first=f.store.sign(f.request),second=f.store.sign(f.request);await Promise.resolve();expect(f.sign).toHaveBeenCalledTimes(1);release();await expect(Promise.all([first,second])).resolves.toHaveLength(2);expect(f.sign).toHaveBeenCalledTimes(1);});
});
