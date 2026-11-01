import {managedProvisionConfigSchema,provisionDigest,type ProvisionConfig} from "./contract";
import {PAYOUT_AUTHORITY_API} from "./payout-authority";
import {PayoutEnrolmentError,type PayoutAuthorityProvider,type PayoutAuthorityReceipt} from "./payout-enrolment";

export class PayoutAuthorityClient implements PayoutAuthorityProvider{
 #origin:string;#token:string;
 constructor(origin:string,token:string,private transport:typeof fetch=fetch){try{const url=new URL(origin);
  if(url.origin!=="http://127.0.0.1:8893"||url.pathname!=="/"||url.search||url.hash||!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw new Error();
  this.#origin=url.origin;this.#token=token;}catch{throw new PayoutEnrolmentError("rejected");}
 }
 async request(path:string,config:ProvisionConfig,write=false){
  try{const response=await this.transport(this.#origin+path,{method:write?"POST":"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
   headers:{Authorization:`Bearer ${this.#token}`,Accept:"application/json",...(write?{"Content-Type":"application/json"}:{})},...(write?{body:JSON.stringify(config)}:{})});
   if(!response.ok){await response.body?.cancel();if(!write&&response.status===404)throw new PayoutEnrolmentError("absent");throw new PayoutEnrolmentError(response.status<500?"rejected":"unknown");}
   const reader=response.body?.getReader();if(!reader)throw new Error();let text="",bytes=0;const decoder=new TextDecoder();
   try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>16_384)throw new Error();text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
   const value=JSON.parse(text) as PayoutAuthorityReceipt;if(value.api!==PAYOUT_AUTHORITY_API||value.state!=="recorded"||value.cityId!==config.cityId||
    value.payoutVersion!==config.payoutVersion||value.configHash!==provisionDigest(config))throw new Error();return value;
  }catch(error){if(error instanceof PayoutEnrolmentError)throw error;throw new PayoutEnrolmentError("unknown");}
 }
 status(input:ProvisionConfig){const config=managedProvisionConfigSchema.parse(input);return this.request(`/v1/authority/${config.cityId}/${config.payoutVersion}`,config);}
 register(input:ProvisionConfig){const config=managedProvisionConfigSchema.parse(input);return this.request("/v1/authority/enrol",config,true);}
}
