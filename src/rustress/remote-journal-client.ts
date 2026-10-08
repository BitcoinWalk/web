import {journalClaimSchema,journalPageSchema,journalReceiptSchema,journalStateSchema,type JournalClaim} from "./remote-journal-store";

export class RemoteJournalClient {
 #origin:string;#token:string;
 constructor(origin:string,token:string,readonly serviceId:string,readonly binding:string,private transport:typeof fetch=fetch){
  const url=new URL(origin);
  if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||!url.port||url.username||url.password||url.pathname!=="/"||url.hash||url.search||!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw new Error("Invalid private journal connection");
  journalStateSchema.parse({serviceId,binding,fence:null,active:false,lastSequence:0});this.#origin=url.origin;this.#token=token;
 }
 private async request(path:string,body?:unknown){
  try{
   const response=await this.transport(this.#origin+path,{method:body===undefined?"GET":"POST",redirect:"error",signal:AbortSignal.timeout(5000),cache:"no-store",
    headers:{Authorization:`Bearer ${this.#token}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!response.ok){await response.body?.cancel();throw new Error();}
   const reader=response.body?.getReader();if(!reader)throw new Error();let size=0;const chunks:Uint8Array[]=[];
   try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768)throw new Error();chunks.push(part.value);}}finally{await reader.cancel();}
   return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }catch{throw new Error("Journal outcome unconfirmed; sending remains blocked");}
 }
 private bound(state:ReturnType<typeof journalStateSchema.parse>){if(state.serviceId!==this.serviceId||state.binding!==this.binding)throw new Error("Journal identity mismatch");return state;}
 async status(){return this.bound(journalStateSchema.parse(await this.request("/v1/journal/status")));}
 async page(after=0){const result=journalPageSchema.parse(await this.request("/v1/journal/page",{after}));this.bound(result.state);return result;}
 /** Only a first durable claim may permit a send. An exact retry is evidence of
  * prior recording, NOT a renewed permission after a lost acknowledgement. */
 async claim(input:JournalClaim){
  const c=journalClaimSchema.parse(input);if(c.serviceId!==this.serviceId||c.binding!==this.binding)throw new Error("Journal identity mismatch");
  const result=journalReceiptSchema.parse(await this.request("/v1/journal/claim",c));this.bound(result.state);
  if(!result.state.active||result.state.fence!==c.fence||result.entry.id!==c.id||result.entry.hash!==c.hash||result.entry.commitment!==c.commitment)throw new Error("Journal receipt mismatch");
  if(result.outcome==="created"&&result.entry.fence!==c.fence)throw new Error("Journal receipt mismatch");
  return result;
 }
}
