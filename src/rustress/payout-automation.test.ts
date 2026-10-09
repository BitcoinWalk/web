import {createHash,randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it,vi} from "vitest";
import {PayoutAutomation} from "./payout-automation";
import {PayoutLedger} from "./payout-ledger";

const dbs:DatabaseSync[]=[];
afterEach(()=>{vi.useRealTimers();for(const db of dbs.splice(0))db.close();});
function fixture(enabled=true){
 const db=new DatabaseSync(":memory:");dbs.push(db);const ledger=new PayoutLedger(db),walletRef="fixture";
 const bucket={cityId:randomUUID(),walletRef,destinationVersion:1,destination:"alice@example.org"},hash=createHash("sha256").update("incoming").digest("hex");
 ledger.register({...bucket,paymentHash:hash,amountMsat:"100000"});ledger.settle(walletRef,hash,"100000");
 let ready=false;
 const runtime={get ready(){return ready;},reconcile:vi.fn<()=>Promise<{state:string}>>(async()=>{ready=true;return {state:"reconciled"};}),poll:vi.fn<()=>Promise<{state:string;result?:unknown}>>(async()=>({state:"completed",result:{}})),
  prepare:vi.fn<()=>Promise<{state:string;result?:unknown}>>(async()=>({state:"completed",result:{}})),run:vi.fn<()=>Promise<{state:string;result?:unknown}>>(async()=>({state:"completed",result:{}})),pause:vi.fn(()=>{ready=false;})};
 return {ledger,bucket,hash,runtime,automation:new PayoutAutomation(runtime,ledger,walletRef,()=>enabled,5000),disable:()=>{enabled=false;}};
}
describe("default-off payout automation",()=>{
 it("does nothing without an external enable grant",async()=>{const f=fixture(false);expect(f.automation.start()).toBe(false);expect(await f.automation.cycle()).toEqual({state:"paused"});expect(f.runtime.reconcile).not.toHaveBeenCalled();});
 it("reconciles, sweeps and creates at most one payout for an eligible bucket",async()=>{const f=fixture();expect(await f.automation.cycle()).toEqual({state:"completed",resumed:0,prepared:1,completed:1});expect(f.runtime.prepare).toHaveBeenCalledWith(f.hash,expect.any(String));expect(f.runtime.run).toHaveBeenCalledTimes(1);});
 it("resumes durable attempts before scanning and excludes their bucket from a new invoice",async()=>{const f=fixture(),id=randomUUID();f.ledger.reserve(f.bucket,id,"ab".repeat(32),"79000","10000");expect(await f.automation.cycle()).toMatchObject({state:"completed",resumed:1,prepared:0});expect(f.runtime.run).toHaveBeenCalledWith(id);expect(f.runtime.prepare).not.toHaveBeenCalled();});
 it("pauses fail closed and prevents overlapping cycles",async()=>{const f=fixture();f.runtime.poll.mockResolvedValueOnce({state:"paused"});expect(await f.automation.cycle()).toEqual({state:"blocked"});expect(f.runtime.pause).toHaveBeenCalled();});
 it("starts only when enabled and stop invalidates runtime",async()=>{vi.useFakeTimers();const f=fixture();expect(f.automation.start()).toBe(true);expect(f.automation.start()).toBe(false);await vi.advanceTimersByTimeAsync(1);f.automation.stop();expect(f.automation.running).toBe(false);expect(f.runtime.pause).toHaveBeenCalled();});
});
