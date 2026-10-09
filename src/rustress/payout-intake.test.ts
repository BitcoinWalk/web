import {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {PayoutInvoiceIntake,PAYOUT_INVOICE_API} from "./payout-intake";
import {PayoutLedger} from "./payout-ledger";
const dbs:DatabaseSync[]=[];afterEach(()=>dbs.splice(0).forEach(db=>db.close()));
function fixture(){const db=new DatabaseSync(":memory:");dbs.push(db);const ledger=new PayoutLedger(db),now=1800000000;
 const bucket={cityId:randomUUID(),walletRef:"fixture",destinationVersion:2,destination:"private@example.org"},resolve=vi.fn<(_cityId:string,_version:number)=>Promise<typeof bucket|null>>(async()=>bucket);
 const intake=new PayoutInvoiceIntake(ledger,resolve,()=>now),request={api:PAYOUT_INVOICE_API,cityId:bucket.cityId,payoutVersion:2,paymentHash:"ab".repeat(32),amountMsat:"100000",issuedAt:now,expiresAt:now+3600};return{ledger,bucket,resolve,intake,request,now};}
describe("private payout invoice intake",()=>{
 it("resolves the private destination and durably records before presentation",async()=>{const f=fixture();expect(await f.intake.register(f.request)).toMatchObject({state:"recorded",cityId:f.bucket.cityId});expect(f.ledger.incoming("fixture",f.request.paymentHash)).toEqual({...f.bucket,paymentHash:f.request.paymentHash,amountMsat:"100000"});});
 it("is exactly idempotent and rejects a conflicting hash snapshot",async()=>{const f=fixture();await f.intake.register(f.request);await f.intake.register(f.request);await expect(f.intake.register({...f.request,amountMsat:"200000"})).rejects.toThrow("could not be recorded");});
 it.each(["stale","future","expired","long","version","city","missing"])('rejects %s evidence without registration',async mode=>{const f=fixture(),request={...f.request};if(mode==="stale")request.issuedAt=f.now-301;if(mode==="future")request.issuedAt=f.now+31;if(mode==="expired")request.expiresAt=f.now+30;if(mode==="long")request.expiresAt=request.issuedAt+86401;if(mode==="version")request.payoutVersion=3;if(mode==="city")f.resolve.mockResolvedValue({...f.bucket,cityId:randomUUID()});if(mode==="missing")f.resolve.mockResolvedValue(null);
  await expect(f.intake.register(request)).rejects.toThrow("could not be recorded");expect(f.ledger.incoming("fixture",request.paymentHash)).toBeNull();});
 it("never accepts a destination or wallet reference from the invoice producer",async()=>{const f=fixture();await expect(f.intake.register({...f.request,destination:"attacker@example.org"})).rejects.toThrow();expect(f.resolve).not.toHaveBeenCalled();});
});
