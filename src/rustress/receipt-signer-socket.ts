import {timingSafeEqual} from "node:crypto";
import {request as httpRequest,type IncomingMessage,type RequestListener} from "node:http";
import {decode} from "bolt11";
import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
import type {ZapReceiptSigner} from "./zap-receipt-authority";
import {RECEIPT_SIGNER_API,type ReceiptSignerStore} from "./receipt-signer";

const responseSchema=z.object({api:z.literal(RECEIPT_SIGNER_API),event:z.object({id:z.string().regex(/^[0-9a-f]{64}$/),pubkey:z.string().regex(/^[0-9a-f]{64}$/),created_at:z.number().int().safe().positive(),kind:z.literal(9735),tags:z.array(z.array(z.string())),content:z.literal(""),sig:z.string().regex(/^[0-9a-f]{128}$/)}).strict()}).strict();
function authorized(value:string|undefined,token:string){
 const supplied=value?.startsWith("Bearer ")?value.slice(7):"",left=Buffer.from(supplied),right=Buffer.from(token);
 return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);
}
async function readBody(request:IncomingMessage){
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of request){const value=Buffer.from(chunk);size+=value.length;if(size>131072)throw new Error();chunks.push(value);}
 return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
function exact(event:Event,template:EventTemplate,pubkey:string){
 return event.pubkey===pubkey&&verifyEvent(structuredClone(event))&&event.kind===template.kind&&event.created_at===template.created_at&&event.content===template.content&&JSON.stringify(event.tags)===JSON.stringify(template.tags);
}

export function receiptSignerHandler(store:ReceiptSignerStore,token:string):RequestListener{
 if(!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw new Error("Invalid signer credential");
 return (request,response)=>{void (async()=>{
  let status=404,body:unknown={error:"not-found"};
  try{
   if(!authorized(request.headers.authorization,token)){status=401;body={error:"unauthorized"};}
   else if(request.method==="POST"&&request.url==="/v1/sign"){const event=await store.sign(await readBody(request));status=200;body={api:RECEIPT_SIGNER_API,event};}
  }catch{status=400;body={error:"request-rejected"};}
  response.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify(body));
 })();};
}

/** Client capability held by the networked receipt worker. It can request one
 * exact signature over a Unix socket but never receives or loads the key. */
export class ReceiptSignerSocketClient implements ZapReceiptSigner{
 constructor(readonly publicKey:string,private socketPath:string,private token:string,private timeoutMs=3000){
  if(!/^[0-9a-f]{64}$/.test(publicKey)||!socketPath.startsWith("/")||!/^[A-Za-z0-9_-]{43,256}$/.test(token)||timeoutMs<1000||timeoutMs>10000)throw new Error("Invalid receipt signer client");
 }
 async sign(template:EventTemplate){
  const bolt=template.tags.filter(tag=>tag[0]==="bolt11");if(bolt.length!==1||bolt[0].length!==2)throw new Error("Receipt signer rejected");
  let paymentHash:string;try{paymentHash=decode(bolt[0][1]).tagsObject.payment_hash!;}catch{throw new Error("Receipt signer rejected");}
  if(!/^[0-9a-f]{64}$/.test(paymentHash))throw new Error("Receipt signer rejected");
  const document=JSON.stringify({api:RECEIPT_SIGNER_API,paymentHash,template}),result=await new Promise<unknown>((resolve,reject)=>{
   const request=httpRequest({socketPath:this.socketPath,path:"/v1/sign",method:"POST",headers:{authorization:`Bearer ${this.token}`,"content-type":"application/json","content-length":Buffer.byteLength(document)},timeout:this.timeoutMs},response=>{
    const chunks:Buffer[]=[];let size=0;
    response.on("data",chunk=>{const value=Buffer.from(chunk);size+=value.length;if(size>131072)response.destroy(new Error("Signer response too large"));else chunks.push(value);});
    response.on("error",reject);response.on("end",()=>{try{if(response.statusCode!==200)throw new Error();resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(new Error("Receipt signer rejected"));}});
   });
   request.on("timeout",()=>request.destroy(new Error("Receipt signer timeout")));request.on("error",reject);request.end(document);
  });
  const event=responseSchema.parse(result).event as Event;
  if(!exact(event,template,this.publicKey))throw new Error("Receipt signer rejected");
  return event;
 }
}
