import {createHash} from "node:crypto";
import {encode,sign as signBolt} from "bolt11";
import {finalizeEvent,getPublicKey,nip57} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {lightningAddress,parseZapPayMetadata,verifyPublicZapReceipt} from "./public-zap";

const payerKey=new Uint8Array(32).fill(2),providerKey=new Uint8Array(32).fill(3),recipient=getPublicKey(new Uint8Array(32).fill(4)),provider=getPublicKey(providerKey),amount=100_000,preimage="12".repeat(32);
function fixture(){
 const request=finalizeEvent(nip57.makeZapRequest({pubkey:recipient,amount,comment:"Great walk",relays:["wss://relay.ditto.pub/"]}),payerKey),document=JSON.stringify(request),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex"),descriptionHash=createHash("sha256").update(document).digest("hex"),invoice=signBolt(encode({millisatoshis:String(amount),timestamp:1_800_000_000,tags:[{tagName:"payment_hash",data:paymentHash},{tagName:"purpose_commit_hash",data:descriptionHash},{tagName:"expire_time",data:3600}]}),"34".repeat(32)).paymentRequest!;
 const receipt=finalizeEvent({kind:9735,created_at:1_800_000_010,content:"",tags:[["p",recipient],["P",request.pubkey],["bolt11",invoice],["description",document],["preimage",preimage]]},providerKey);
 return {request,receipt};
}
describe("public verified zap presentation",()=>{
 it("accepts only the managed BitcoinWalk address and strict NIP-57 metadata",()=>{
  expect(lightningAddress("lightning:madeira@bitcoinwalk.org").metadata).toBe("https://bitcoinwalk.org/.well-known/lnurlp/madeira");
  expect(()=>lightningAddress("lightning:madeira@example.org")).toThrow("unavailable");
  expect(parseZapPayMetadata({tag:"payRequest",callback:"https://bitcoinwalk.org/api/callback",minSendable:1000,maxSendable:1_000_000_000,allowsNostr:true,nostrPubkey:provider})).toMatchObject({nostrPubkey:provider});
  expect(()=>parseZapPayMetadata({tag:"payRequest",callback:"https://evil.example/callback",minSendable:1000,maxSendable:1000,allowsNostr:true,nostrPubkey:provider})).toThrow("not enabled");
 });
 it("verifies the exact provider-signed receipt commitments",async()=>{const f=fixture();await expect(verifyPublicZapReceipt(f.receipt,f.request,provider,recipient,amount)).resolves.toBe(true);const changed={...f.receipt,tags:f.receipt.tags.map(tag=>tag[0]==="p"?["p","ff".repeat(32)]:tag)};await expect(verifyPublicZapReceipt(changed,f.request,provider,recipient,amount)).resolves.toBe(false);});
});
