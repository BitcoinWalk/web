import {describe,expect,it,vi} from "vitest";
import {RustressWalletShadow,type ShadowProbe} from "./wallet-shadow";

const token="ab".repeat(32),binding="cd".repeat(32);
function fixture(){
 const probe:ShadowProbe={binding,getInfo:vi.fn(async()=>({network:"mainnet",methods:["get_info","make_invoice","lookup_invoice","list_transactions","pay_invoice"]})),listTransactions:vi.fn(async()=>({transactions:[]}))};
 return {probe,shadow:new RustressWalletShadow(probe,token,()=>new Date("2026-10-09T00:00:00Z"))};
}
describe("Rustress read-only wallet shadow",()=>{
 it("exposes only redacted public health and authenticated readiness",async()=>{
  const {shadow}=fixture();expect(shadow.route("GET","/healthz")).toEqual({status:200,body:{service:"bitcoinwalk-rustress-wallet-shadow",state:"starting",invoiceIssuanceEnabled:false,payoutsEnabled:false}});
  expect(shadow.route("GET","/v1/readiness")).toEqual({status:401,body:{error:"unauthorized"}});
  await shadow.refresh();const ready=shadow.route("GET","/v1/readiness",`Bearer ${token}`);
  expect(ready.status).toBe(200);expect(ready.body).toMatchObject({state:"verified",binding,network:"mainnet",historyReadable:true,successfulReadMethods:["get_info","list_transactions"],invoiceIssuanceEnabled:false,payoutsEnabled:false});
  expect(JSON.stringify(shadow.route("GET","/healthz"))).not.toContain(binding);
 });
 it("coalesces concurrent refreshes and reads only one history item",async()=>{
  const {shadow,probe}=fixture();await Promise.all([shadow.refresh(),shadow.refresh()]);
  expect(probe.getInfo).toHaveBeenCalledTimes(1);expect(probe.listTransactions).toHaveBeenCalledWith(0,1);
 });
 it("fails closed on the wrong network, methods or history shape",async()=>{
  for(const mutate of [
   (p:ShadowProbe)=>vi.mocked(p.getInfo).mockResolvedValue({network:"testnet",methods:["get_info"]}),
   (p:ShadowProbe)=>vi.mocked(p.getInfo).mockResolvedValue({network:"mainnet",methods:["get_info"]}),
   (p:ShadowProbe)=>vi.mocked(p.listTransactions).mockResolvedValue({transactions:[{},{}]}),
  ]){const {shadow,probe}=fixture();mutate(probe);await shadow.refresh();expect(shadow.route("GET","/v1/readiness",`Bearer ${token}`)).toMatchObject({status:503,body:{state:"unavailable",consecutiveFailures:1}});}
 });
 it("does not expose wallet operations or accept alternate routes",()=>{
  const {shadow}=fixture();expect("makeInvoice" in shadow).toBe(false);expect("lookupInvoice" in shadow).toBe(false);expect("send" in shadow).toBe(false);
  for(const path of ["/admin","/.well-known/nostr.json","/.well-known/lnurlp/city","/callback","/v1/pay"])expect(shadow.route("GET",path)).toEqual({status:404,body:{error:"not found"}});
  expect(shadow.route("POST","/healthz")).toEqual({status:404,body:{error:"not found"}});
 });
});
