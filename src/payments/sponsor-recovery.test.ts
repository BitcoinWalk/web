import {describe,expect,it} from "vitest";
import type {SponsorOrder} from "./sponsor-types";
import {parseSponsorRecovery,recoveryForOrder} from "./sponsor-recovery";

const id="10000000-0000-4000-8000-000000000001",cityId="20000000-0000-4000-8000-000000000002",token="a".repeat(64),walkId="b".repeat(64);
const recovery={id,cityId,token,count:1,ids:[walkId]};
const order:SponsorOrder={id,cityId,cityName:"Madeira",count:1,amountMsat:21_000_000,walks:[{id:walkId,address:"walk",start:1,label:"Madeira walk"}],status:"paid",invoice:"",paymentHash:"c".repeat(64),createdAt:1,expiresAt:2,settledAt:2,recoveryAcknowledgedAt:2,pubkey:"d".repeat(64),logoHash:null,needsReview:false};

describe("private sponsor recovery files",()=>{
 it("accepts only complete bounded checkout recovery material",()=>{expect(parseSponsorRecovery(JSON.stringify(recovery))).toEqual(recovery);for(const value of [null,"{}",JSON.stringify({...recovery,token:"secret"}),JSON.stringify({...recovery,ids:[]})])expect(parseSponsorRecovery(value)).toBeNull();});
 it("offers a file only for the exact order, city, package and walks",()=>{expect(recoveryForOrder(JSON.stringify(recovery),order)).toEqual(recovery);expect(recoveryForOrder(JSON.stringify({...recovery,id:"30000000-0000-4000-8000-000000000003"}),order)).toBeNull();expect(recoveryForOrder(JSON.stringify({...recovery,ids:["e".repeat(64)]}),order)).toBeNull();});
});
