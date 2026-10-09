import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {PayoutServiceController} from "./payout-service-controller";
describe("payout service monitoring controller",()=>{
 beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
 function fixture(enabled=true){let ready=false,state:"completed"|"blocked"|"paused"="completed";const automation={stop:vi.fn(),cycle:vi.fn(async()=>({state}))},records:unknown[]=[];
  const controller=new PayoutServiceController(automation,()=>ready,()=>enabled,()=>1800000000,5000,value=>records.push(value));return {automation,controller,records,setReady:(v:boolean)=>{ready=v;},setState:(v:typeof state)=>{state=v;}};}
 it("stays stopped when disabled and records no cycles",()=>{const f=fixture(false);expect(f.controller.start()).toBe(false);expect(f.controller.status()).toMatchObject({running:false,consecutiveFailures:0});expect(f.automation.cycle).not.toHaveBeenCalled();});
 it("runs serialized aggregate cycles and clears consecutive failures on recovery",async()=>{const f=fixture();f.setState("blocked");expect(f.controller.start()).toBe(true);await vi.advanceTimersByTimeAsync(0);expect(f.controller.status()).toMatchObject({running:true,lastCycleState:"blocked",consecutiveFailures:1});f.setState("completed");f.setReady(true);await vi.advanceTimersByTimeAsync(5000);expect(f.controller.status()).toMatchObject({ready:true,lastCycleState:"completed",consecutiveFailures:0});expect(JSON.stringify(f.records)).not.toMatch(/[0-9a-f]{64}/);f.controller.stop();expect(f.automation.stop).toHaveBeenCalled();expect(f.controller.status().running).toBe(false);});
});
