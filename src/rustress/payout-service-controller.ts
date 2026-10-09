type CycleResult={state:"completed"|"blocked"|"paused"};
type Automation={stop:()=>void;cycle:()=>Promise<CycleResult>};
/** Aggregate operational state only. No hashes, invoices, destinations, wallet
 * errors or credentials are retained or exposed. */
export class PayoutServiceController{
 #lastCycleAt?:number;#lastCycleState?:CycleResult["state"];#failures=0;#timer?:ReturnType<typeof setInterval>;
 constructor(private automation:Automation,private ready:()=>boolean,private enabled:()=>boolean,private now=()=>Math.floor(Date.now()/1000),
  private intervalMs=15000,private record:(status:ReturnType<PayoutServiceController["status"]>)=>void=()=>{}){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<5000||intervalMs>300000)throw new Error("Invalid payout controller interval");
 }
 start(){if(this.#timer||!this.enabled())return false;this.#timer=setInterval(()=>{void this.cycle();},this.intervalMs);this.#timer.unref?.();void this.cycle();return true;}
 stop(){if(this.#timer)clearInterval(this.#timer);this.#timer=undefined;this.automation.stop();this.record(this.status());}
 async cycle(){
  const result=await this.automation.cycle();this.#lastCycleAt=this.now();this.#lastCycleState=result.state;
  this.#failures=result.state==="completed"?0:this.#failures+1;this.record(this.status());return result;
 }
 status(){return {running:!!this.#timer,ready:this.ready(),lastCycleAt:this.#lastCycleAt,lastCycleState:this.#lastCycleState,consecutiveFailures:this.#failures};}
}
