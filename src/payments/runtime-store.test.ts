import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";

const key=Symbol.for("bitcoinwalk.payment-store");
let directory="";

afterEach(()=>{
 const shared=globalThis as typeof globalThis&{[key]?:{db:{close():void}}};
 shared[key]?.db.close();delete shared[key];
 vi.unstubAllEnvs();vi.resetModules();
 if(directory)rmSync(directory,{recursive:true,force:true});
});

describe("payment store boundary",()=>{
 it("opens durable evidence without requiring a wallet credential",async()=>{
  directory=mkdtempSync(join(tmpdir(),"bitcoinwalk-store-"));
  vi.stubEnv("BITCOINWALK_PAYMENT_DATABASE",join(directory,"payments.sqlite"));
  vi.stubEnv("BITCOINWALK_NWC_URL","");
  const {getPaymentStore}=await import("./store-runtime");
  expect(getPaymentStore().db.prepare("SELECT 1 value").get()).toEqual({value:1});
 });
});
