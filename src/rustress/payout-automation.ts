import {randomUUID} from "node:crypto";
import type {PayoutLedger} from "./payout-ledger";
type Operation={state:string;result?:unknown};
type Runtime={readonly ready:boolean;reconcile:()=>Promise<Operation>;poll:(after?:number,maxPages?:number)=>Promise<Operation>;
 prepare:(hash:string,id:string)=>Promise<Operation>;run:(id:string)=>Promise<Operation>;pause:()=>void};

/** Default-off bounded supervisor. It owns no credentials or operator grant.
 * Every cycle reuses PayoutRuntime's fresh deployment/readiness/recovery gates. */
export class PayoutAutomation {
 #busy=false;#timer?:ReturnType<typeof setInterval>;
 constructor(private runtime:Runtime,private ledger:PayoutLedger,private walletRef:string,
  private enabled:()=>boolean=()=>false,private intervalMs=15000){
  if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(walletRef)||!Number.isSafeInteger(intervalMs)||intervalMs<5000||intervalMs>300000)throw new Error("Invalid payout automation configuration");
 }
 get running(){return !!this.#timer;}
 start(){
  if(this.#timer||!this.enabled())return false;
  this.#timer=setInterval(()=>{void this.cycle();},this.intervalMs);this.#timer.unref?.();void this.cycle();return true;
 }
 stop(){if(this.#timer)clearInterval(this.#timer);this.#timer=undefined;this.runtime.pause();}
 async cycle(){
  if(!this.enabled()||this.#busy)return {state:"paused" as const};
  this.#busy=true;let resumed=0,prepared=0,completed=0;
  try{
   if(!this.runtime.ready&&(await this.runtime.reconcile()).state!=="reconciled")throw new Error();
   for(const id of this.ledger.pendingPayoutIds(this.walletRef,50)){
    const result=await this.runtime.run(id);if(result.state!=="completed")throw new Error();resumed++;
   }
   const scan=await this.runtime.poll(0,10);if(scan.state!=="completed")throw new Error();
   for(const row of this.ledger.payableBuckets(this.walletRef,20)){
    const id=randomUUID(),saved=await this.runtime.prepare(row.sourceHash,id);if(saved.state!=="completed")throw new Error();prepared++;
    const result=await this.runtime.run(id);if(result.state!=="completed")throw new Error();completed++;
   }
   return {state:"completed" as const,resumed,prepared,completed};
  }catch{this.runtime.pause();return {state:"blocked" as const};}finally{this.#busy=false;}
 }
}
