import {timingSafeEqual} from "node:crypto";

export type ShadowProbe={
 binding:string;
 getInfo:()=>Promise<Record<string,unknown>>;
 listTransactions:(offset?:number,limit?:number)=>Promise<Record<string,unknown>>;
};

type ShadowState={
 state:"starting"|"verified"|"unavailable";
 lastSuccessAt?:string;
 lastAttemptAt?:string;
 consecutiveFailures:number;
 network?:"mainnet";
 advertisedMethods?:string[];
 historyReadable?:true;
};

const requiredMethods=["get_info","make_invoice","lookup_invoice","list_transactions","pay_invoice"];

export class RustressWalletShadow{
 #state:ShadowState={state:"starting",consecutiveFailures:0};
 #running?:Promise<void>;
 constructor(private readonly probe:ShadowProbe,private readonly token:string,private readonly now=()=>new Date()){
  if(!/^[0-9a-f]{64}$/.test(token)||!/^[0-9a-f]{64}$/.test(probe.binding))throw new Error("Invalid private shadow configuration");
 }
 publicHealth(){return {service:"bitcoinwalk-rustress-wallet-shadow",state:this.#state.state,invoiceIssuanceEnabled:false,payoutsEnabled:false};}
 privateReady(authorization:string|undefined){
  if(!this.#authorized(authorization))return {status:401,body:{error:"unauthorized"}};
  const status=this.#state.state==="verified"?200:503;
  return {status,body:{...this.publicHealth(),...this.#state,binding:this.probe.binding,successfulReadMethods:this.#state.state==="verified"?["get_info","list_transactions"]:[]}};
 }
 route(method:string|undefined,url:string|undefined,authorization?:string){
  if(method!=="GET")return {status:404,body:{error:"not found"}};
  if(url==="/healthz")return {status:200,body:this.publicHealth()};
  if(url==="/v1/readiness")return this.privateReady(authorization);
  return {status:404,body:{error:"not found"}};
 }
 refresh(){
  if(!this.#running)this.#running=this.#refresh().finally(()=>{this.#running=undefined;});
  return this.#running;
 }
 async #refresh(){
  const attempted=this.now().toISOString();
  try{
   const info=await this.probe.getInfo(),methods=info.methods,history=await this.probe.listTransactions(0,1);
   if(info.network!=="mainnet"||!Array.isArray(methods)||!requiredMethods.every(value=>methods.includes(value))||!Array.isArray(history.transactions)||history.transactions.length>1)throw new Error();
   this.#state={state:"verified",lastAttemptAt:attempted,lastSuccessAt:this.now().toISOString(),consecutiveFailures:0,network:"mainnet",advertisedMethods:requiredMethods,historyReadable:true};
  }catch{
   this.#state={...this.#state,state:"unavailable",lastAttemptAt:attempted,consecutiveFailures:this.#state.consecutiveFailures+1};
  }
 }
 #authorized(value:string|undefined){
  const prefix="Bearer ";if(!value?.startsWith(prefix))return false;
  const supplied=Buffer.from(value.slice(prefix.length)),expected=Buffer.from(this.token);
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
 }
}
