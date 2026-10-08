import {lookup} from "node:dns/promises";
import {request} from "node:https";
import {isIP} from "node:net";
import {normalizePayoutDestination} from "../server/lnurl-pay";
import {outgoingTermsSchema,validateOutgoingInvoice,type OutgoingTerms} from "./outgoing-invoice";

// Conservative IPv4-only egress for this isolated adapter. IPv6-only providers
// fail closed until a reviewed IPv6 range policy is added.
export function publicIPv4(value:string){
 if(isIP(value)!==4)return false;
 const [a,b,c]=value.split(".").map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
  a===192&&(b===0||b===168||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||
  a===198&&b===51&&c===100||a===203&&b===0&&c===113);
}
export function recipientUrl(value:string){
 const url=new URL(value);
 if(value.length>4096||url.protocol!=="https:"||url.username||url.password||url.hash||
  url.port&&url.port!=="443"||isIP(url.hostname)||url.hostname.includes(":" )||
  url.hostname.endsWith(".")||!url.hostname.includes(".")||
  url.hostname==="bitcoinwalk.org"||url.hostname.endsWith(".bitcoinwalk.org"))throw new Error("Invalid recipient URL");
 return url;
}
export async function recipientJson(input:URL):Promise<unknown>{
 const url=recipientUrl(input.href);
 // One deadline includes DNS, TLS and the entire response, not just idle time.
 return new Promise((resolve,reject)=>{
  let done=false,active:ReturnType<typeof request>|undefined;
  const finish=(error?:Error,body?:unknown)=>{if(done)return;done=true;clearTimeout(timer);active?.destroy();if(error)reject(new Error("Recipient endpoint unavailable"));else resolve(body);};
  const timer=setTimeout(()=>finish(new Error()),7000);
  void lookup(url.hostname,{all:true,verbatim:true}).then(rows=>{
   if(done)return;
   if(!rows.length||rows.some(row=>!publicIPv4(row.address))){finish(new Error());return;}
   const address=rows[0].address;
   active=request({hostname:url.hostname,port:443,path:url.pathname+url.search,method:"GET",
    // Keep hostname for TLS certificate verification; pin the validated address.
    lookup:(_hostname,_options,callback)=>callback(null,address,4),agent:false,family:4,
    headers:{Accept:"application/json","Accept-Encoding":"identity","User-Agent":"BitcoinWalk-Payout/1.0"}},response=>{
     if(response.statusCode!==200||!['application/json','application/lnurlp+json'].includes(String(response.headers['content-type']).split(';')[0].trim().toLowerCase())||
      response.headers['content-encoding']&&response.headers['content-encoding']!=="identity") {response.destroy();finish(new Error());return;}
     let size=0;const chunks:Buffer[]=[];
     response.on("data",chunk=>{size+=chunk.length;if(size>65536){response.destroy();finish(new Error());}else chunks.push(Buffer.from(chunk));});
     response.on("error",()=>finish(new Error()));
     response.on("aborted",()=>finish(new Error()));
     response.on("end",()=>{try{finish(undefined,JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{finish(new Error());}});
    });
   active.on("error",()=>finish(new Error()));active.end();
  }).catch(()=>finish(new Error()));
 });
}
/** Internal only: destination comes from the immutable obligation, never request
 * JSON. Invoice retrieval creates no reservation and has no wallet capability. */
export async function retrieveRecipientInvoice(destination:string,amountMsat:string,network:OutgoingTerms["network"],
 options:{fetchJson?:(url:URL)=>Promise<unknown>;now?:()=>number}={}){
 try{
  const fetchJson=options.fetchJson??recipientJson;
  const endpoint=recipientUrl(normalizePayoutDestination(destination).endpoint);
  const body=await fetchJson(endpoint) as Record<string,unknown>;
  if(!body||body.tag!=="payRequest"||body.status==="ERROR"||!Number.isSafeInteger(body.minSendable)||!Number.isSafeInteger(body.maxSendable))throw new Error();
  const terms=outgoingTermsSchema.parse({amountMsat,minMsat:String(body.minSendable),maxMsat:String(body.maxSendable),network,metadata:body.metadata});
  const metadata:unknown=JSON.parse(terms.metadata);
  if(!Array.isArray(metadata)||!metadata.every(row=>Array.isArray(row)&&row.length===2&&row.every(v=>typeof v==="string"))||!metadata.some(row=>row[0]==="text/plain"))throw new Error();
  if(BigInt(amountMsat)%1000n||BigInt(amountMsat)<BigInt(terms.minMsat)||BigInt(amountMsat)>BigInt(terms.maxMsat))throw new Error();
  if(typeof body.callback!=="string")throw new Error();
  const callback=recipientUrl(body.callback);
  // No cross-origin callback delegation in the first adapter. Providers that
  // require it need an explicit reviewed allow-list, not a broad exception.
  if(callback.origin!==endpoint.origin)throw new Error();
  callback.searchParams.set("amount",amountMsat);
  const invoice=await fetchJson(callback) as Record<string,unknown>;
  if(!invoice||invoice.status==="ERROR"||typeof invoice.pr!=="string")throw new Error();
  return validateOutgoingInvoice(invoice.pr,terms,(options.now??(()=>Math.floor(Date.now()/1000)))());
 }catch{throw new Error("Recipient invoice could not be verified");}
}
