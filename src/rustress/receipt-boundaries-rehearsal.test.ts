import {createHash,randomBytes,randomUUID} from "node:crypto";
import {chmodSync,mkdtempSync,rmSync} from "node:fs";
import {createServer,type Server} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {encode,sign as signBolt} from "bolt11";
import {finalizeEvent,getPublicKey,type Event,type EventTemplate} from "nostr-tools";
import {afterEach,describe,expect,it,vi} from "vitest";
import type {PayoutAuthorityStore} from "./payout-authority";
import {PayoutControlApi} from "./payout-control-api";
import type {PayoutInvoiceIntake} from "./payout-intake";
import type {PayoutInvoiceIssuer} from "./payout-invoice-issuer";
import type {PayoutLedger} from "./payout-ledger";
import {ReceiptEvidenceClient} from "./receipt-evidence-client";
import {receiptEvidenceSocketHandler} from "./receipt-evidence-socket";
import {ReceiptRelayEgressClient,receiptRelayEgressHandler} from "./receipt-relay-egress";
import {ReceiptSignerStore} from "./receipt-signer";
import {ReceiptSignerSocketClient,receiptSignerHandler} from "./receipt-signer-socket";
import {ZapReceiptAuthority,ZAP_RECEIPT_API} from "./zap-receipt-authority";

const servers:Server[]=[],databases:DatabaseSync[]=[],directories:string[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));databases.splice(0).forEach(db=>db.close());directories.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true}));});

function listen(server:Server,path:string){servers.push(server);return new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(path,()=>{chmodSync(path,0o600);resolve();});});}

describe("synthetic receipt boundary rehearsal",()=>{
 it("moves one exact paid claim through evidence, signer and relay-egress sockets and resumes after restart",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"bw-receipt-rehearsal-"));directories.push(directory);chmodSync(directory,0o700);
  const evidenceSocket=join(directory,"evidence.sock"),signerSocket=join(directory,"signer.sock"),egressSocket=join(directory,"relay.sock");
  const evidenceToken=randomBytes(32).toString("base64url"),signerToken=randomBytes(32).toString("base64url"),egressToken=randomBytes(32).toString("base64url"),otherToken=randomBytes(32).toString("base64url");
  const providerKey=new Uint8Array(32).fill(3),provider=getPublicKey(providerKey),payerKey=new Uint8Array(32).fill(2),recipient=getPublicKey(new Uint8Array(32).fill(4));
  const now=1_800_000_000,preimage="12".repeat(32),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex"),relay="wss://one.example/";
  const zap=finalizeEvent({kind:9734,created_at:now-10,content:"Walk on!",tags:[["relays",relay],["amount","100000"],["p",recipient],["P",provider]]},payerKey),raw=JSON.stringify(zap),descriptionHash=createHash("sha256").update(raw).digest("hex");
  const invoice=signBolt(encode({millisatoshis:"100000",timestamp:now-60,tags:[{tagName:"payment_hash",data:paymentHash},{tagName:"purpose_commit_hash",data:descriptionHash},{tagName:"expire_time",data:3600}]}),"34".repeat(32)).paymentRequest!;
  const proof={api:"bitcoinwalk-zap-settlement-v1",cityId:randomUUID(),payoutVersion:1,invoice,paymentHash,amountMsat:"100000",descriptionHash,settledAt:now,preimage};

  const receiptEvidence=vi.fn(async()=>proof),issuer={receiptEvidence} as unknown as PayoutInvoiceIssuer;
  const payoutApi=new PayoutControlApi({} as PayoutAuthorityStore,{} as PayoutInvoiceIntake,{} as PayoutLedger,"synthetic-wallet",()=>true,()=>({running:true,ready:true,consecutiveFailures:0}),{intake:otherToken,issuer:randomBytes(32).toString("base64url"),receipt:evidenceToken,authority:randomBytes(32).toString("base64url"),operations:randomBytes(32).toString("base64url")},issuer);
  await listen(createServer(receiptEvidenceSocketHandler(payoutApi)),evidenceSocket);

  const signerDb=new DatabaseSync(join(directory,"signer.sqlite"));databases.push(signerDb);const sign=vi.fn(async(template:EventTemplate)=>finalizeEvent(template,providerKey));
  await listen(createServer(receiptSignerHandler(new ReceiptSignerStore(signerDb,provider,sign,()=>now),signerToken)),signerSocket);

  const published:Event[]=[],publish=vi.fn(async(_relays:string[],event:Event)=>{published.push(structuredClone(event));return published.length===1?[]:[relay];});
  await listen(createServer(receiptRelayEgressHandler(provider,{publish},egressToken)),egressSocket);

  const authorityPath=join(directory,"authority.sqlite"),claim={api:ZAP_RECEIPT_API,cityId:proof.cityId,payoutVersion:proof.payoutVersion,paymentHash,recipientPubkey:recipient,amountMsat:"100000",zapRequest:raw};
  const firstDb=new DatabaseSync(authorityPath),evidence=new ReceiptEvidenceClient(evidenceToken,evidenceSocket),signer=new ReceiptSignerSocketClient(provider,signerSocket,signerToken),egress=new ReceiptRelayEgressClient(egressSocket,egressToken);databases.push(firstDb);
  await expect(new ZapReceiptAuthority(firstDb,signer,value=>evidence.get(value),egress).issue(claim)).rejects.toThrow("publication pending");
  firstDb.close();databases.splice(databases.indexOf(firstDb),1);
  const restartedDb=new DatabaseSync(authorityPath);databases.push(restartedDb);const result=await new ZapReceiptAuthority(restartedDb,signer,value=>evidence.get(value),egress).issue(claim);

  expect(result).toMatchObject({state:"published",relays:[relay]});expect(receiptEvidence).toHaveBeenCalledTimes(1);expect(sign).toHaveBeenCalledTimes(1);expect(publish).toHaveBeenCalledTimes(2);expect(published[1]).toEqual(published[0]);expect(published[0]).toMatchObject({kind:9735,pubkey:provider,content:""});
  expect((await payoutApi.route("POST","/v1/receipts/evidence",`Bearer ${evidenceToken}`,{claim:"exact"})).status).toBe(404);
 });
});
