import {describe,expect,it} from "vitest";
import type {SponsorOrder} from "./sponsor-types";
import {parseSponsorRecovery,recoveryForOrder} from "./sponsor-recovery";

const id="10000000-0000-4000-8000-000000000001",cityId="20000000-0000-4000-8000-000000000002",token="a".repeat(64),walkId="b".repeat(64);
const recovery={id,cityId,token,count:1,ids:[walkId]};
const order:SponsorOrder={id,cityId,cityName:"Madeira",count:1,amountMsat:21_000_000,walks:[{id:walkId,address:"walk",start:1,label:"Madeira walk"}],status:"paid",invoice:"",paymentHash:"c".repeat(64),createdAt:1,expiresAt:2,settledAt:2,recoveryAcknowledgedAt:2,pubkey:"d".repeat(64),logoHash:null,draftName:null,draftWebsite:null,needsReview:false,payoutPolicy:{origin:"platform",hostBasisPoints:0,retainedBasisPoints:10000}};

describe("private sponsor recovery files",()=>{
 it("accepts only complete bounded checkout recovery material",()=>{expect(parseSponsorRecovery(JSON.stringify(recovery))).toEqual(recovery);for(const value of [null,"{}",JSON.stringify({...recovery,token:"secret"}),JSON.stringify({...recovery,ids:[]})])expect(parseSponsorRecovery(value)).toBeNull();});
 it("preserves a valid private host invitation token and rejects malformed values",()=>{const invited={...recovery,invitationToken:"f".repeat(64)};expect(parseSponsorRecovery(JSON.stringify(invited))).toEqual(invited);expect(parseSponsorRecovery(JSON.stringify({...invited,invitationToken:"public-link"}))).toBeNull();});
 it("retains a bounded multi-city or global campaign snapshot",()=>{const secondCity="30000000-0000-4000-8000-000000000003",secondWalk="e".repeat(64),batch={...recovery,count:2,ids:[walkId,secondWalk],scope:"global" as const,selections:[{cityId,ids:[walkId]},{cityId:secondCity,ids:[secondWalk]}]};expect(parseSponsorRecovery(JSON.stringify(batch))).toEqual(batch);expect(parseSponsorRecovery(JSON.stringify({...batch,selections:[{cityId,ids:[]}]}))).toBeNull();});
 it("offers a file only for the exact order, city, package and walks",()=>{expect(recoveryForOrder(JSON.stringify(recovery),order)).toEqual(recovery);expect(recoveryForOrder(JSON.stringify({...recovery,id:"30000000-0000-4000-8000-000000000003"}),order)).toBeNull();expect(recoveryForOrder(JSON.stringify({...recovery,ids:["e".repeat(64)]}),order)).toBeNull();});
});
