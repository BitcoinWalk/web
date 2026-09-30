import {beforeEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,getPublicKey,nip44,nip04,type Event} from "nostr-tools";
import {NwcWallet} from "./nwc";
const mock=vi.hoisted(()=>({response:undefined as undefined|((event:Event)=>void),info:undefined as Event|undefined,onpublish:undefined as undefined|((event:Event)=>Promise<void>)}));
vi.mock("nostr-tools/relay",()=>({Relay:class{
 async connect(){} close(){}
 subscribe(filters:Array<{kinds:number[]}>,handlers:{onevent:(event:Event)=>void;oneose?:()=>void}){if(filters[0].kinds[0]===13194)queueMicrotask(()=>{handlers.onevent(mock.info!);handlers.oneose?.();});else mock.response=handlers.onevent;return{close(){}};}
 async publish(event:Event){await mock.onpublish?.(event);return"ok";}
}}));
const walletSecret=Uint8Array.from(Buffer.from("23".repeat(32),"hex")),clientSecret=Uint8Array.from(Buffer.from("12".repeat(32),"hex"));
const walletKey=getPublicKey(walletSecret),clientKey=getPublicKey(clientSecret),hash="ab".repeat(32);
function wallet(){return new NwcWallet(`nostr+walletconnect://${walletKey}?relay=wss://example.org&secret=${Buffer.from(clientSecret).toString("hex")}`);}
beforeEach(()=>{mock.info=finalizeEvent({kind:13194,created_at:Math.floor(Date.now()/1000),tags:[["encryption","nip44_v2 nip04"]],content:"make_invoice lookup_invoice"},walletSecret);});
describe("NWC transport",()=>{
 it("encrypts the exact payment hash and accepts only the correlated wallet reply",async()=>{
  mock.onpublish=async event=>{
   expect(event.kind).toBe(23194);expect(event.tags).toContainEqual(["encryption","nip44_v2"]);
   const key=nip44.getConversationKey(walletSecret,clientKey);
   expect(JSON.parse(nip44.decrypt(event.content,key))).toEqual({method:"lookup_invoice",params:{payment_hash:hash}});
   const response=finalizeEvent({kind:23195,created_at:event.created_at,tags:[["p",clientKey],["e",event.id]],content:nip44.encrypt(JSON.stringify({result_type:"lookup_invoice",result:{payment_hash:hash,type:"incoming",amount:21000000,state:"pending"}}),key)},walletSecret);
   mock.response?.({...response,pubkey:clientKey}); // forged author must be ignored
   mock.response?.(response);
  };
  expect(await wallet().lookupInvoice(hash)).toMatchObject({payment_hash:hash});
 });
 it("supports the legacy wallet encryption advertisement",async()=>{
  mock.info=finalizeEvent({kind:13194,created_at:1,tags:[],content:"lookup_invoice"},walletSecret);
  mock.onpublish=async event=>{expect(JSON.parse(await nip04.decrypt(walletSecret,clientKey,event.content)).method).toBe("lookup_invoice");mock.response?.(finalizeEvent({kind:23195,created_at:event.created_at,tags:[["p",clientKey],["e",event.id]],content:await nip04.encrypt(walletSecret,clientKey,JSON.stringify({result_type:"lookup_invoice",result:{payment_hash:hash}}))},walletSecret));};
  expect(await wallet().lookupInvoice(hash)).toEqual({payment_hash:hash});
 });
 it("rejects wallet errors without propagating raw wallet text",async()=>{
  mock.onpublish=async event=>{mock.response?.(finalizeEvent({kind:23195,created_at:event.created_at,tags:[["p",clientKey],["e",event.id]],content:nip44.encrypt(JSON.stringify({result_type:"lookup_invoice",error:{code:"RESTRICTED",message:"sensitive internal detail"}}),nip44.getConversationKey(walletSecret,clientKey))},walletSecret));};
  await expect(wallet().lookupInvoice(hash)).rejects.toThrow("Wallet request could not be confirmed");
 });
 it("refuses unsupported methods before publication",async()=>{
  mock.info=finalizeEvent({kind:13194,created_at:1,tags:[],content:"get_balance"},walletSecret);
  const publish=vi.fn();mock.onpublish=publish;
  await expect(wallet().lookupInvoice(hash)).rejects.toThrow();expect(publish).not.toHaveBeenCalled();
 });
});

