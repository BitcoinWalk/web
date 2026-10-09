import {createHash,randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {createServer,type IncomingMessage,type Server} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {PAYOUT_RECEIPT_EVIDENCE_API} from "./payout-invoice-issuer";
import {ReceiptEvidenceClient} from "./receipt-evidence-client";

const secret="s".repeat(48),raw='{"kind":9734}',descriptionHash=createHash("sha256").update(raw).digest("hex"),preimage="12".repeat(32),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex"),cityId=randomUUID();
const claim={api:"bitcoinwalk-zap-receipt-v1" as const,cityId,payoutVersion:2,paymentHash,recipientPubkey:"ab".repeat(32),amountMsat:"100000",zapRequest:raw};
const proof={api:PAYOUT_RECEIPT_EVIDENCE_API,cityId,payoutVersion:2,invoice:"lnbc-valid-fixture-invoice",paymentHash,amountMsat:"100000",descriptionHash,settledAt:1_800_000_000,preimage};
const directories:string[]=[],servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});});
async function requestBody(request:IncomingMessage){const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string,unknown>;}
function fixture(value:unknown=proof,status=200){
 const directory=mkdtempSync(join(tmpdir(),"receipt-evidence-")),socket=join(directory,"evidence.sock"),seen:{url?:string;method?:string;authorization?:string;body?:Record<string,unknown>}={};directories.push(directory);
 const server=createServer((request,response)=>{void requestBody(request).then(body=>{Object.assign(seen,{url:request.url,method:request.method,authorization:request.headers.authorization,body});response.writeHead(status,{"content-type":"application/json"});response.end(typeof value==="string"?value:JSON.stringify(value));});});servers.push(server);
 return new Promise<{client:ReceiptEvidenceClient;seen:typeof seen}>(resolve=>server.listen(socket,()=>resolve({client:new ReceiptEvidenceClient(secret,socket),seen})));
}
describe("private receipt settlement client",()=>{
 it("uses only the Unix socket evidence route and validates exact claim-bound evidence",async()=>{const f=await fixture();await expect(f.client.get(claim)).resolves.toEqual(proof);expect(f.seen).toEqual({url:"/v1/receipts/evidence",method:"POST",authorization:`Bearer ${secret}`,body:{api:PAYOUT_RECEIPT_EVIDENCE_API,cityId,payoutVersion:2,paymentHash,amountMsat:"100000",descriptionHash}});expect(JSON.stringify(f.seen.body)).not.toContain("zapRequest");});
 it.each([{cityId:randomUUID()},{payoutVersion:3},{paymentHash:"ef".repeat(32)},{amountMsat:"99000"},{descriptionHash:"ef".repeat(32)},{extra:"leak"}])("rejects mismatched authority evidence: %j",async patch=>{const f=await fixture({...proof,...patch});await expect(f.client.get(claim)).rejects.toThrow("could not be verified");});
 it("fails closed on denial and malformed or oversized responses",async()=>{const denied=await fixture({error:"denied"},401);await expect(denied.client.get(claim)).rejects.toThrow();const malformed=await fixture("x".repeat(16385));await expect(malformed.client.get(claim)).rejects.toThrow();});
 it("rejects relative socket paths and malformed credentials",()=>{expect(()=>new ReceiptEvidenceClient(secret,"relative.sock")).toThrow();expect(()=>new ReceiptEvidenceClient("short")).toThrow();});
});
