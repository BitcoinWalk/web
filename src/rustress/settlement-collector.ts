import type {PayoutFlow} from "./payout-flow";
/** Off by default, no timer/listener. Hints trigger exact authenticated lookup;
 * bounded sweeps revisit saved pending invoices and recover missed hints. */
export class SettlementCollector {
 #busy=false;
 #hints=new Set<string>();
 constructor(private flow:Pick<PayoutFlow,"collect"|"sweep">,private enabled:()=>boolean=()=>false){}
 hint(hash:string){
  if(!this.enabled()||!/^[0-9a-f]{64}$/.test(hash)||this.#hints.size>=100)return false;
  this.#hints.add(hash);return true;
 }
 async poll(after=0,maxPages=10){
  if(!this.enabled()||this.#busy)return {state:"paused" as const};
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>20)throw new Error("Invalid collector bounds");
  this.#busy=true;let cursor=after,credited=0,failed=0,pending=0;
  try{
   for(const hash of [...this.#hints]){
    if(!this.enabled())return {state:"paused" as const};
    this.#hints.delete(hash);
    try{await this.flow.collect(hash);}catch{/* Persisted pending rows remain eligible for sweep. */}
   }
   for(let page=0;page<maxPages;page++){
    if(!this.enabled())return {state:"paused" as const};
    const result=await this.flow.sweep(cursor,50);
    credited+=result.credited;failed+=result.failed;pending+=result.pending;
    if(result.done)return {state:"scanned" as const,cursor:0,done:true,credited,failed,pending};
    if(result.cursor<=cursor)throw new Error();cursor=result.cursor;
   }
   return {state:"scanned" as const,cursor,done:false,credited,failed,pending};
  }catch{return {state:"unconfirmed" as const,cursor:after};}finally{this.#busy=false;}
 }
}
