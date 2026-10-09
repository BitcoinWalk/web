import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it} from "vitest";
import {PayoutAuthorityStore} from "./payout-authority";
import type {ProvisionConfig} from "./contract";
const dbs:DatabaseSync[]=[];afterEach(()=>dbs.splice(0).forEach(db=>db.close()));
const config:ProvisionConfig={cityId:"00000000-0000-4000-8000-000000000001",version:1,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:"a".repeat(64),authorityEventId:"b".repeat(64),approvalEventId:"c".repeat(64),brandEventId:"d".repeat(64),payoutVersion:2,payoutDestination:"organizer@example.org",walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"};
describe("private payout authority",()=>{
 function fixture(){const db=new DatabaseSync(":memory:");dbs.push(db);return new PayoutAuthorityStore(db);}
 it("stores an immutable destination version and resolves only its payout bucket",()=>{const store=fixture();expect(store.register(config)).toMatchObject({state:"recorded",payoutVersion:2});expect(store.register(config)).toMatchObject({state:"recorded"});expect(store.resolve(config.cityId,2)).toEqual({cityId:config.cityId,walletRef:"bitcoinwalk-rustress",destinationVersion:2,destination:"organizer@example.org"});expect(store.resolve(config.cityId,1)).toBeNull();expect(store.count()).toBe(1);});
 it("rejects version conflicts, circular destinations and extra credentials",()=>{const store=fixture();store.register(config);expect(()=>store.register({...config,payoutDestination:"other@example.org"})).toThrow("conflict");expect(()=>store.register({...config,payoutVersion:3,payoutDestination:"madeira@bitcoinwalk.org"})).toThrow();expect(()=>store.register({...config,payoutVersion:3,nwc:"secret"})).toThrow();});
});
