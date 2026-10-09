import {timingSafeEqual} from "node:crypto";
import {request as httpRequest,type IncomingMessage,type RequestListener} from "node:http";
import {verifyEvent,type Event} from "nostr-tools";
import {z} from "zod";
import type {ZapReceiptPublisher} from "./zap-receipt-authority";

export const RECEIPT_RELAY_EGRESS_API="bitcoinwalk-receipt-relay-egress-v1" as const;
const tokenPattern=/^[A-Za-z0-9_-]{43,256}$/,wss=z.string().url().refine(value=>new URL(value).protocol==="wss:");
const eventSchema=z.object({id:z.string().regex(/^[0-9a-f]{64}$/),pubkey:z.string().regex(/^[0-9a-f]{64}$/),created_at:z.number().int().safe().positive(),kind:z.literal(9735),tags:z.array(z.array(z.string())),content:z.literal(""),sig:z.string().regex(/^[0-9a-f]{128}$/)}).strict();
const requestSchema=z.object({api:z.literal(RECEIPT_RELAY_EGRESS_API),relays:z.array(wss).min(1).max(3),event:eventSchema}).strict();
const responseSchema=z.object({api:z.literal(RECEIPT_RELAY_EGRESS_API),relays:z.array(wss).max(3)}).strict();
function authorized(value:string|undefined,token:string){const supplied=value?.startsWith("Bearer ")?value.slice(7):"",left=Buffer.from(supplied),right=Buffer.from(token);return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);}
async function body(request:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of request){const value=Buffer.from(chunk);size+=value.length;if(size>131072)throw new Error();chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;}

export function receiptRelayEgressHandler(provider:string,publisher:ZapReceiptPublisher,token:string):RequestListener{
 if(!/^[0-9a-f]{64}$/.test(provider)||!tokenPattern.test(token))throw new Error("Invalid relay egress configuration");
 return (request,response)=>{void (async()=>{let status=404,result:unknown={error:"not-found"};try{
  if(request.method==="POST"&&request.url==="/v1/publish"&&!authorized(request.headers.authorization,token)){status=401;result={error:"unauthorized"};}
  else if(request.method==="POST"&&request.url==="/v1/publish"){
   if(!request.headers["content-type"]?.toLowerCase().startsWith("application/json")){status=415;result={error:"unsupported-media-type"};}
   else{
   const parsed=requestSchema.parse(await body(request)),event=parsed.event as Event;if(event.pubkey!==provider||!verifyEvent(structuredClone(event)))throw new Error();
   const relays=await publisher.publish(parsed.relays,event);status=200;result={api:RECEIPT_RELAY_EGRESS_API,relays};
   }
  }
 }catch{status=400;result={error:"request-rejected"};}response.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify(result));})();};
}

export class ReceiptRelayEgressClient implements ZapReceiptPublisher{
 constructor(private socketPath:string,private token:string,private timeoutMs=15000){if(!socketPath.startsWith("/")||!tokenPattern.test(token)||timeoutMs<1000||timeoutMs>20000)throw new Error("Invalid relay egress client");}
 async publish(relays:string[],event:Event){
  const document=JSON.stringify({api:RECEIPT_RELAY_EGRESS_API,relays,event}),result=await new Promise<unknown>((resolve,reject)=>{const request=httpRequest({socketPath:this.socketPath,path:"/v1/publish",method:"POST",headers:{authorization:`Bearer ${this.token}`,"content-type":"application/json","content-length":Buffer.byteLength(document)},timeout:this.timeoutMs},response=>{const chunks:Buffer[]=[];let size=0;response.on("data",chunk=>{const value=Buffer.from(chunk);size+=value.length;if(size>65536)response.destroy(new Error());else chunks.push(value);});response.on("error",reject);response.on("end",()=>{try{if(response.statusCode!==200)throw new Error();resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(new Error("Receipt relay egress rejected"));}});});request.on("timeout",()=>request.destroy(new Error("Receipt relay egress timeout")));request.on("error",reject);request.end(document);});
  const parsed=responseSchema.parse(result);if(parsed.relays.some(value=>!relays.map(item=>new URL(item).toString()).includes(new URL(value).toString())))throw new Error("Receipt relay egress rejected");return parsed.relays;
 }
}
