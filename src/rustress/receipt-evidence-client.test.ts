import {createHash,randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {PAYOUT_RECEIPT_EVIDENCE_API} from "./payout-invoice-issuer";
import {ReceiptEvidenceClient} from "./receipt-evidence-client";

const secret="s".repeat(48),raw='{"kind":9734}',descriptionHash=createHash("sha256").update(raw).digest("hex"),preimage="12".repeat(32),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex"),cityId=randomUUID();
const claim={api:"bitcoinwalk-zap-receipt-v1" as const,cityId,payoutVersion:2,paymentHash,recipientPubkey:"ab".repeat(32),amountMsat:"100000",zapRequest:raw};
const proof={api:PAYOUT_RECEIPT_EVIDENCE_API,cityId,payoutVersion:2,invoice:"lnbc-valid-fixture-invoice",paymentHash,amountMsat:"100000",descriptionHash,settledAt:1_800_000_000,preimage};
function reply(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});}
describe("private receipt settlement client",()=>{
 it("uses only the receipt endpoint and validates exact claim-bound evidence",async()=>{const fetcher=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{void input;void init;return reply(proof);}),client=new ReceiptEvidenceClient(secret,fetcher);await expect(client.get(claim)).resolves.toEqual(proof);expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8893/v1/receipts/evidence",expect.objectContaining({method:"POST",headers:expect.objectContaining({authorization:`Bearer ${secret}`})}));const body=JSON.parse(fetcher.mock.calls[0][1]?.body as string);expect(body).toEqual({api:PAYOUT_RECEIPT_EVIDENCE_API,cityId,payoutVersion:2,paymentHash,amountMsat:"100000",descriptionHash});expect(JSON.stringify(body)).not.toContain("zapRequest");});
 it.each([{cityId:randomUUID()},{payoutVersion:3},{paymentHash:"ef".repeat(32)},{amountMsat:"99000"},{descriptionHash:"ef".repeat(32)},{extra:"leak"}])("rejects mismatched or oversized authority evidence: %j",async patch=>{const client=new ReceiptEvidenceClient(secret,vi.fn(async()=>reply({...proof,...patch})));await expect(client.get(claim)).rejects.toThrow("could not be verified");});
 it("fails closed on denial and malformed or oversized responses",async()=>{await expect(new ReceiptEvidenceClient(secret,vi.fn(async()=>reply({error:"denied"},401))).get(claim)).rejects.toThrow();await expect(new ReceiptEvidenceClient(secret,vi.fn(async()=>new Response("x".repeat(16385)))).get(claim)).rejects.toThrow();});
 it("rejects non-loopback origins and malformed credentials",()=>{expect(()=>new ReceiptEvidenceClient(secret,fetch,"http://localhost:8893")).toThrow();expect(()=>new ReceiptEvidenceClient("short")).toThrow();});
});
