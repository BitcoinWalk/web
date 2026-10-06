import {describe,it,expect} from "vitest";
import {encode,sign} from "bolt11";
import {validateInvoice,NwcWallet} from "./nwc";
const now=1800000000,hash="ab".repeat(32);
function fixture(sats=21000,paymentHash=hash,timestamp=now,expiry=3600){return sign(encode({satoshis:sats,timestamp,tags:[{tagName:"payment_hash",data:paymentHash},{tagName:"description",data:"test fixture"},{tagName:"expire_time",data:expiry}]}),"12".repeat(32)).paymentRequest!;}
describe("invoice validation",()=>{
 it("does not expose a malformed connection string in errors",()=>{try{new NwcWallet("private-nwc-secret-invalid");throw new Error("expected failure");}catch(error){expect(String(error)).not.toContain("private-nwc-secret-invalid");}});
 it("decodes the actual invoice's amount, hash and expiry",()=>{expect(validateInvoice({type:"incoming",amount:21000000,payment_hash:hash,invoice:fixture()},now)).toMatchObject({amountMsat:21000000,paymentHash:hash,expiresAt:now+3600});});
 it.each([42000,69000])("validates sponsorship invoice %i against its real BOLT11 amount",sats=>{expect(validateInvoice({type:"incoming",amount:sats*1000,payment_hash:hash,invoice:fixture(sats)},now,sats*1000).amountMsat).toBe(sats*1000);expect(()=>validateInvoice({type:"incoming",amount:sats*1000,payment_hash:hash,invoice:fixture(21000)},now,sats*1000)).toThrow();});
 it.each([fixture(1),fixture(21001),fixture(21000,"cd".repeat(32)),fixture(21000,hash,now-7200),fixture(21000,hash,now,172800),"lnbc1broken"])("rejects a misleading wallet response %#",invoice=>{expect(()=>validateInvoice({type:"incoming",amount:21000000,payment_hash:hash,invoice},now)).toThrow();});
 it("rejects insecure relay configuration without exposing credentials",()=>{expect(()=>new NwcWallet(`nostr+walletconnect://${"34".repeat(32)}?relay=ws://example.org&secret=${"12".repeat(32)}`)).toThrow("NWC relay requires WSS");});
});
