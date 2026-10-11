import {createHash,randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it,vi} from "vitest";
import {encode,sign as signBolt} from "bolt11";
import {finalizeEvent,getPublicKey,type Event,type EventTemplate} from "nostr-tools";
import {validateZapRequest,ZapReceiptAuthority,ZAP_RECEIPT_API} from "./zap-receipt-authority";

const dbs:DatabaseSync[]=[];afterEach(()=>dbs.splice(0).forEach(db=>db.close()));
const payerKey=new Uint8Array(32).fill(2),signerKey=new Uint8Array(32).fill(3),recipient=getPublicKey(new Uint8Array(32).fill(4)),signerPubkey=getPublicKey(signerKey),now=1_800_000_000,preimage="12".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
function fixture(patch:Record<string,unknown>={}){
 const request=finalizeEvent({kind:9734,created_at:now-10,content:"Walk on!",tags:[["relays","wss://nos.lol/","wss://relay.ditto.pub/"],["amount","100000"],["p",recipient],["e","ab".repeat(32)],["k","31923"]]},payerKey),raw=JSON.stringify(request),descriptionHash=createHash("sha256").update(raw).digest("hex");
 const invoice=signBolt(encode({millisatoshis:"100000",timestamp:now-60,tags:[{tagName:"payment_hash",data:hash},{tagName:"purpose_commit_hash",data:descriptionHash},{tagName:"expire_time",data:3600}]}),"34".repeat(32)).paymentRequest!;
 const claim={api:ZAP_RECEIPT_API,cityId:randomUUID(),payoutVersion:1,paymentHash:hash,recipientPubkey:recipient,amountMsat:"100000",zapRequest:raw},evidence=vi.fn(async()=>({invoice,paymentHash:hash,amountMsat:"100000",descriptionHash,settledAt:now,preimage,...patch}));
 const signer={publicKey:signerPubkey,sign:vi.fn(async(template:EventTemplate)=>finalizeEvent(template,signerKey))},publisher={publish:vi.fn(async(relays:string[],event:Event)=>{void relays;void event;return ["wss://nos.lol/"];})};
 const db=new DatabaseSync(":memory:");dbs.push(db);return {db,claim,evidence,signer,publisher,authority:new ZapReceiptAuthority(db,signer,evidence,publisher)};
}
describe("private NIP-57 receipt authority",()=>{
 it("isolates each city's admission budget and applies it to direct issue calls",async()=>{
  const f=fixture();
  for(let i=0;i<64;i++)f.authority.enqueue({...f.claim,paymentHash:i.toString(16).padStart(64,"0")});
  expect(()=>f.authority.enqueue({...f.claim,paymentHash:"ab".repeat(32)})).toThrow("queue full");
  expect(f.authority.enqueue({...f.claim,cityId:randomUUID(),paymentHash:"cd".repeat(32)})).toMatchObject({state:"prepared"});
  await expect(f.authority.issue({...f.claim,paymentHash:"ef".repeat(32)})).rejects.toThrow("queue full");
  expect(f.evidence).not.toHaveBeenCalled();
 });
 it("reclaims only prepared claims after fresh authenticated expiry evidence reaches the recovery horizon",async()=>{
  const f=fixture(),paid=await f.evidence(),{settledAt,preimage,...base}=paid;void settledAt;void preimage;
  const expiresAt=now+3540,evidence=async()=>({...base,state:"unsettled" as const,expiresAt,observedAt:expiresAt+30*86400});
  const authority=new ZapReceiptAuthority(f.db,f.signer,evidence,f.publisher);authority.enqueue(f.claim);
  expect(await authority.retryPending(expiresAt+30*86400)).toEqual({attempted:1,published:0});
  expect(authority.status()).toEqual({});expect(f.signer.sign).not.toHaveBeenCalled();
 });
 it("frees active capacity for dormant requests but caps retained unpaid work without deleting it",()=>{
  const f=fixture(),insert=f.db.prepare("INSERT INTO bw_zap_receipt(payment_hash,claim,state,relays) VALUES(?,?,'prepared','[]')"),park=f.db.prepare("INSERT INTO bw_zap_receipt_dormant VALUES(?)");
  f.db.exec("BEGIN");for(let i=0;i<1000;i++)insert.run(`fixture-${i}`,"{}");f.db.exec("COMMIT");
  expect(()=>f.authority.enqueue(f.claim)).toThrow("queue full");
  f.db.exec("BEGIN");for(let i=0;i<1000;i++)park.run(`fixture-${i}`);f.db.exec("COMMIT");
  expect(f.authority.enqueue(f.claim)).toMatchObject({state:"prepared"});
  f.db.exec("BEGIN");for(let i=1000;i<9999;i++){insert.run(`fixture-${i}`,"{}");park.run(`fixture-${i}`);}f.db.exec("COMMIT");
  expect(f.authority.enqueue(f.claim)).toMatchObject({state:"prepared"});
  expect(()=>f.authority.enqueue({...f.claim,paymentHash:"ef".repeat(32)})).toThrow("queue full");
  expect(f.db.prepare("SELECT COUNT(*) count FROM bw_zap_receipt").get()).toEqual({count:10000});
 });
 it("parks verified expired unpaid claims, retains exact bytes and recovers late settlement after restart",async()=>{
  const f=fixture(),paid=await f.evidence(),{settledAt,preimage,...base}=paid;void settledAt;void preimage;
  let settled=false;const evidence=async()=>settled?paid:{...base,state:"unsettled" as const,expiresAt:now+3540,observedAt:now+3540+86400};
  const authority=new ZapReceiptAuthority(f.db,f.signer,evidence,f.publisher);authority.enqueue(f.claim);
  expect(await authority.retryPending(now+90000)).toEqual({attempted:1,published:0});expect(f.signer.sign).not.toHaveBeenCalled();
  expect(f.db.prepare("SELECT COUNT(*) AS count FROM bw_zap_receipt_dormant").get()).toEqual({count:1});
  expect(authority.enqueue(f.claim)).toMatchObject({state:"prepared"});expect(()=>authority.enqueue({...f.claim,cityId:randomUUID()})).toThrow("conflict");
  const restarted=new ZapReceiptAuthority(f.db,f.signer,evidence,f.publisher);settled=true;
  expect(await restarted.retryPending(now+90001)).toEqual({attempted:0,published:0});
  expect(await restarted.retryPending(now+90000+86400)).toEqual({attempted:1,published:1});expect(f.signer.sign).toHaveBeenCalledTimes(1);
  expect(f.db.prepare("SELECT COUNT(*) AS count FROM bw_zap_receipt_dormant").get()).toEqual({count:0});
 });
 it("never parks lookup failures or mismatched expiry evidence",async()=>{
  const f=fixture(),paid=await f.evidence(),{settledAt,preimage,...base}=paid;void settledAt;void preimage;
  const evidence=vi.fn(async()=>({...base,state:"unsettled" as const,expiresAt:1,observedAt:now}));
  const authority=new ZapReceiptAuthority(f.db,f.signer,evidence,f.publisher);authority.enqueue(f.claim);await authority.retryPending(now);
  evidence.mockRejectedValueOnce(new Error("offline"));await authority.retryPending(now+15);
  expect(f.db.prepare("SELECT COUNT(*) AS count FROM bw_zap_receipt_dormant").get()).toEqual({count:0});expect(f.signer.sign).not.toHaveBeenCalled();
 });
 it("validates the exact zap before issuing any invoice",()=>{
  const f=fixture(),{recipientPubkey,amountMsat,zapRequest}=f.claim;
  expect(validateZapRequest({recipientPubkey,amountMsat,zapRequest},signerPubkey)).toEqual({descriptionHash:createHash("sha256").update(zapRequest).digest("hex"),relays:["wss://nos.lol/","wss://relay.ditto.pub/"]});
  expect(()=>validateZapRequest({recipientPubkey,amountMsat:"2000",zapRequest},signerPubkey)).toThrow();
  expect(()=>validateZapRequest({recipientPubkey:"a".repeat(64),amountMsat,zapRequest},signerPubkey)).toThrow();
  expect(f.authority.status()).toEqual({});expect(f.signer.sign).not.toHaveBeenCalled();
 });
 it("durably queues without signing or querying settlement, then resumes after restart",async()=>{
  const f=fixture();expect(f.authority.enqueue(f.claim)).toMatchObject({state:"prepared"});
  expect(f.evidence).not.toHaveBeenCalled();expect(f.signer.sign).not.toHaveBeenCalled();
  const restarted=new ZapReceiptAuthority(f.db,f.signer,f.evidence,f.publisher);
  expect(await restarted.retryPending(now)).toEqual({attempted:1,published:1});
  expect(await restarted.retryPending(now+60)).toEqual({attempted:0,published:0});
 });
 it("persists backoff for unsettled invoices and eventually retries",async()=>{
  const f=fixture();f.authority.enqueue(f.claim);f.evidence.mockRejectedValueOnce(new Error("not settled"));
  expect(await f.authority.retryPending(now)).toEqual({attempted:1,published:0});expect(f.signer.sign).not.toHaveBeenCalled();
  const restarted=new ZapReceiptAuthority(f.db,f.signer,f.evidence,f.publisher);
  expect(await restarted.retryPending(now+14)).toEqual({attempted:0,published:0});
  expect(await restarted.retryPending(now+15)).toEqual({attempted:1,published:1});
 });
 it("retries the exact durable signed event without a second signature",async()=>{
  const f=fixture();f.authority.enqueue(f.claim);f.publisher.publish.mockRejectedValueOnce(new Error("offline"));
  await f.authority.retryPending(now);await new ZapReceiptAuthority(f.db,f.signer,f.evidence,f.publisher).retryPending(now+15);
  expect(f.signer.sign).toHaveBeenCalledTimes(1);expect(f.publisher.publish.mock.calls[0][1]).toEqual(f.publisher.publish.mock.calls[1][1]);
 });
 it("rejects conflicting queued claims and malformed input before persistence",()=>{
 const f=fixture();expect(()=>f.authority.enqueue({...f.claim,zapRequest:"{}"})).toThrow();expect(f.authority.status()).toEqual({});
 f.authority.enqueue(f.claim);expect(()=>f.authority.enqueue({...f.claim,cityId:randomUUID()})).toThrow("conflict");
 expect(f.authority.enqueue(f.claim)).toMatchObject({state:"prepared"});expect(f.authority.status()).toEqual({prepared:1});
 });
 it("accepts longer client relay lists while selecting at most three approved receipt relays",()=>{
  const f=fixture(),event=JSON.parse(f.claim.zapRequest);event.tags.find((tag:string[])=>tag[0]==="relays").splice(1,99,"wss://relay.ditto.pub/","wss://untrusted.example/","wss://relay.primal.net/","wss://relay.damus.io/","wss://nos.lol/");
  f.claim.zapRequest=JSON.stringify(finalizeEvent({kind:event.kind,created_at:event.created_at,content:event.content,tags:event.tags},payerKey));
  expect(validateZapRequest({recipientPubkey:f.claim.recipientPubkey,amountMsat:f.claim.amountMsat,zapRequest:f.claim.zapRequest},signerPubkey).relays).toEqual(["wss://relay.ditto.pub/","wss://relay.primal.net/","wss://relay.damus.io/"]);
 });
 it("uses fixed approved receipt relays when clients provide no approved hints",()=>{
  const f=fixture(),event=JSON.parse(f.claim.zapRequest);event.tags.find((tag:string[])=>tag[0]==="relays").splice(1,99,"wss://one.example/","wss://two.example/","wss://three.example/","wss://four.example/");
  f.claim.zapRequest=JSON.stringify(finalizeEvent({kind:event.kind,created_at:event.created_at,content:event.content,tags:event.tags},payerKey));
  expect(validateZapRequest({recipientPubkey:f.claim.recipientPubkey,amountMsat:f.claim.amountMsat,zapRequest:f.claim.zapRequest},signerPubkey).relays).toEqual(["wss://nos.lol/","wss://relay.damus.io/","wss://relay.primal.net/"]);
 });
 it("validates settlement, signs the required receipt and persists it before publication",async()=>{const f=fixture(),result=await f.authority.issue(f.claim);expect(result).toMatchObject({state:"published",relays:["wss://nos.lol/"]});const event=f.publisher.publish.mock.calls[0][1];expect(event).toMatchObject({kind:9735,pubkey:signerPubkey,created_at:now,content:""});expect(event.tags).toEqual(expect.arrayContaining([["p",recipient],["P",getPublicKey(payerKey)],["bolt11",expect.stringMatching(/^lnbc/)],["description",f.claim.zapRequest],["preimage",preimage]]));});
 it("reuses the exact signed receipt after a publication outage and after restart",async()=>{const f=fixture();f.publisher.publish.mockRejectedValueOnce(new Error("offline"));await expect(f.authority.issue(f.claim)).rejects.toThrow();const restarted=new ZapReceiptAuthority(f.db,f.signer,f.evidence,f.publisher);await restarted.issue(f.claim);expect(f.signer.sign).toHaveBeenCalledTimes(1);expect(f.evidence).toHaveBeenCalledTimes(1);expect(f.publisher.publish.mock.calls[0][1]).toEqual(f.publisher.publish.mock.calls[1][1]);});
 it("resumes the exact prepared claim after a signer outage",async()=>{const f=fixture();f.signer.sign.mockRejectedValueOnce(new Error("signer offline"));await expect(f.authority.issue(f.claim)).rejects.toThrow();const restarted=new ZapReceiptAuthority(f.db,f.signer,f.evidence,f.publisher);await expect(restarted.issue(f.claim)).resolves.toMatchObject({state:"published"});expect(f.signer.sign).toHaveBeenCalledTimes(2);});
 it("returns a published receipt idempotently without signing or publishing twice",async()=>{const f=fixture();const first=await f.authority.issue(f.claim),second=await f.authority.issue(f.claim);expect(second).toEqual(first);expect(f.signer.sign).toHaveBeenCalledTimes(1);expect(f.publisher.publish).toHaveBeenCalledTimes(1);});
 it.each(["recipient","amount","signature","relays","uppercase provider"])('rejects invalid zap request: %s',async mode=>{const f=fixture(),event=JSON.parse(f.claim.zapRequest);if(mode==="recipient")event.tags.find((t:string[])=>t[0]==="p")[1]="ff".repeat(32);if(mode==="amount")event.tags.find((t:string[])=>t[0]==="amount")[1]="99000";if(mode==="relays")event.tags.find((t:string[])=>t[0]==="relays").push("http://local");if(mode==="uppercase provider")event.tags.push(["P","ff".repeat(32)]);if(mode==="signature")event.content="altered";f.claim.zapRequest=JSON.stringify(event);await expect(f.authority.issue(f.claim)).rejects.toThrow();expect(f.signer.sign).not.toHaveBeenCalled();});
 it("rejects IP-literal relay hints including bracketed IPv6",async()=>{for(const relay of ["wss://127.0.0.1","wss://[::1]"]){const f=fixture(),event=JSON.parse(f.claim.zapRequest);event.tags.find((tag:string[])=>tag[0]==="relays")[1]=relay;f.claim.zapRequest=JSON.stringify(event);await expect(f.authority.issue(f.claim)).rejects.toThrow();expect(f.signer.sign).not.toHaveBeenCalled();}});
 it.each(["hash","amount","description","preimage"])('rejects mismatched settlement evidence: %s',async mode=>{const patch=mode==="hash"?{paymentHash:"ef".repeat(32)}:mode==="amount"?{amountMsat:"99000"}:mode==="description"?{descriptionHash:"ef".repeat(32)}:{preimage:"56".repeat(32)};const f=fixture(patch);await expect(f.authority.issue(f.claim)).rejects.toThrow("Settlement evidence");expect(f.signer.sign).not.toHaveBeenCalled();});
 it("rejects a signer that changes the receipt",async()=>{const f=fixture();f.signer.sign.mockImplementationOnce(async template=>finalizeEvent({...template,content:"changed"},signerKey));await expect(f.authority.issue(f.claim)).rejects.toThrow("signer");expect(f.publisher.publish).not.toHaveBeenCalled();});
 it("rejects conflicting reuse of a payment hash",async()=>{const f=fixture();await f.authority.issue(f.claim);await expect(f.authority.issue({...f.claim,cityId:randomUUID()})).rejects.toThrow("conflict");});
 it("rejects a conflicting concurrent claim instead of joining the first operation",async()=>{const f=fixture(),proof=await f.evidence();let release!:()=>void;f.evidence.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(proof);}));const first=f.authority.issue(f.claim);await Promise.resolve();await expect(f.authority.issue({...f.claim,cityId:randomUUID()})).rejects.toThrow("conflict");release();await expect(first).resolves.toMatchObject({state:"published"});});
});
