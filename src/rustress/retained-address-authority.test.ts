import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it} from "vitest";
import {RetainedAddressAuthorityStore} from "./retained-address-authority";
const dbs:DatabaseSync[]=[];afterEach(()=>{for(const db of dbs)db.close();dbs.length=0;});
const config={version:1,domain:"bitcoinwalk.org" as const,localPart:"donate",walletRef:"bitcoinwalk-rustress",receivingDestination:"bitcoinwalk@getalby.com" as const,invoiceIssuance:"enabled" as const};
describe("retained address authority",()=>{it("stores only exact no-split receiving authority",()=>{const db=new DatabaseSync(":memory:");dbs.push(db);const store=new RetainedAddressAuthorityStore(db);
 expect(store.register(config)).toMatchObject({state:"recorded",localPart:"donate"});expect(store.register(config)).toMatchObject({state:"recorded"});expect(store.resolveInvoice("bitcoinwalk.org","donate",1)).toEqual(config);
 expect(()=>store.register({...config,receivingDestination:"other@example.org"})).toThrow();expect(()=>store.register({...config,localPart:"Bad Name"})).toThrow();});});
