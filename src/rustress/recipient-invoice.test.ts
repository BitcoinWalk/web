import {createHash} from "node:crypto";
import {encode,sign} from "bolt11";
import {describe,it,expect,vi} from "vitest";
import {publicIPv4,recipientUrl,retrieveRecipientInvoice} from "./recipient-invoice";
const metadata='[["text/plain","fixture"]]',now=1800000000;
const pr=sign(encode({satoshis:79,timestamp:now,tags:[{tagName:"payment_hash",data:"ab".repeat(32)},{tagName:"purpose_commit_hash",data:createHash("sha256").update(metadata).digest("hex")},{tagName:"expire_time",data:3600}]}),"12".repeat(32)).paymentRequest!;
const body={tag:"payRequest",callback:"https://wallet.example/pay?token=fixture&amount=1",minSendable:1000,maxSendable:100000,metadata};
describe("isolated recipient invoice retrieval",()=>{
 it("binds invoice to exact metadata and amount from the saved destination",async()=>{
  const fetchJson=vi.fn().mockResolvedValueOnce(body).mockResolvedValueOnce({pr});
  expect(await retrieveRecipientInvoice("alice@wallet.example","79000","bc",{fetchJson,now:()=>now})).toMatchObject({paymentRequest:pr,amountMsat:"79000"});
  expect(fetchJson.mock.calls[0][0].href).toBe("https://wallet.example/.well-known/lnurlp/alice");
  expect(fetchJson.mock.calls[1][0].searchParams.getAll("amount")).toEqual(["79000"]);
 });
 it.each([{callback:"https://other.example/pay"},{callback:"http://wallet.example/pay"},{callback:"https://127.0.0.1/pay"},{minSendable:80000},{maxSendable:78000},{minSendable:"1000"},{status:"ERROR"}])("rejects unsafe metadata before callback: %j",async patch=>{
  const fetchJson=vi.fn().mockResolvedValue({...body,...patch});
  await expect(retrieveRecipientInvoice("alice@wallet.example","79000","bc",{fetchJson})).rejects.toThrow("could not be verified");
  expect(fetchJson).toHaveBeenCalledTimes(1);
 });
 it("rejects mismatched metadata commitments and redacts provider errors",async()=>{
  const fetchJson=vi.fn().mockResolvedValueOnce({...body,metadata:'[["text/plain","other"]]'}).mockResolvedValueOnce({pr});
  await expect(retrieveRecipientInvoice("alice@wallet.example","79000","bc",{fetchJson,now:()=>now})).rejects.toThrow("could not be verified");
  await expect(retrieveRecipientInvoice("alice@wallet.example","79000","bc",{fetchJson:async()=>{throw new Error("secret");}})).rejects.toThrow(/^Recipient invoice could not be verified$/);
 });
 it("rejects unsafe URLs and conservatively excludes non-public addresses",()=>{
  for(const value of ["http://wallet.example","https://wallet.example:8080","https://a:b@wallet.example","https://wallet.example/#x","https://city.bitcoinwalk.org/pay","https://wallet.example./pay","https://[::1]/"] )expect(()=>recipientUrl(value)).toThrow();
  for(const ip of ["127.0.0.1","10.0.0.1","169.254.169.254","172.16.1.1","192.168.1.1","100.64.0.1","198.18.0.1","203.0.113.1","0.0.0.0","224.0.0.1","::1","2001:4860:4860::8888","::ffff:8.8.8.8"])expect(publicIPv4(ip)).toBe(false);
  expect(publicIPv4("8.8.8.8")).toBe(true);
 });
});
