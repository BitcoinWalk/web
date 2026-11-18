import {lookup} from "node:dns/promises";
import {request as httpsRequest} from "node:https";
import {isIP} from "node:net";
import type {Event} from "nostr-tools";
import {parseMediaRequest} from "../domain/media-request";

export class ChatUploadMembershipError extends Error {
 constructor(message:string,readonly status:number){super(message);}
}
const unavailable=()=>new ChatUploadMembershipError("Chat membership could not be checked. Please retry shortly.",503);
let active=0;

function relayOrigin(value:string):string{
 const url=new URL(value);
 if(url.protocol!=="wss:"||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash||isIP(url.hostname))throw unavailable();
 return url.origin;
}

export function chatUploadMembershipEndpoint(relay:string):URL|null{
 const mode=process.env.BITCOINWALK_CHAT_UPLOAD_MEMBERSHIP;
 // Compatibility only during the coordinated rollout; this is NOT authorization.
 if(!mode)return null;
 if(mode!=="required")throw unavailable();
 let allowed:unknown;
 try{allowed=JSON.parse(process.env.BITCOINWALK_CHAT_UPLOAD_RELAYS||"[]");}catch{throw unavailable();}
 if(!Array.isArray(allowed)||!allowed.length||allowed.some(value=>typeof value!=="string"))throw unavailable();
 const origin=relayOrigin(relay);
 if(!allowed.map(value=>relayOrigin(value)).includes(origin))throw new ChatUploadMembershipError("This chat relay is not enabled for image uploads.",403);
 return new URL(origin.replace(/^wss:/,"https:")+"/api/chat/upload-authorization");
}

function publicIPv4(address:string):boolean{
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split(".").map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===0||b===168)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
}

async function check(endpoint:URL,event:Event,signal:AbortSignal):Promise<void>{
 // The deployed relays have IPv4; IPv6-only relays require a reviewed address policy.
 const addresses=await lookup(endpoint.hostname,{all:true,family:4});
 signal.throwIfAborted();
 if(!addresses.length||addresses.some(row=>!publicIPv4(row.address)))throw unavailable();
 const body=JSON.stringify(event);
 if(Buffer.byteLength(body)>16384)throw new ChatUploadMembershipError("Image authorization is too large.",400);
 await new Promise<void>((resolve,reject)=>{
  const request=httpsRequest({hostname:addresses[0].address,port:443,servername:endpoint.hostname,path:endpoint.pathname,method:"POST",signal,
   headers:{Host:endpoint.hostname,"Content-Type":"application/json","Content-Length":Buffer.byteLength(body),Accept:"application/json"}},response=>{
   const fail=(error:Error)=>{response.destroy();reject(error);};
   if(response.statusCode===403){fail(new ChatUploadMembershipError("Only current chat members can upload images.",403));return;}
   if(response.statusCode!==200||String(response.headers["content-type"]||"").split(";",1)[0]!=="application/json"||Number(response.headers["content-length"]||0)>4096){fail(unavailable());return;}
   const chunks:Buffer[]=[];let size=0;
   response.on("data",chunk=>{size+=chunk.length;if(size>4096)fail(unavailable());else chunks.push(chunk);});
   response.on("error",()=>reject(unavailable()));
   response.on("aborted",()=>reject(unavailable()));
   response.on("end",()=>{try{const result=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(result.allowed!==true||result.eventId!==event.id||Object.keys(result).length!==2)throw unavailable();resolve();}catch{reject(unavailable());}});
  });
  request.on("error",()=>reject(unavailable()));request.end(body);
 });
}

export async function requireChatUploadMembership(event:Event):Promise<void>{
 const command=parseMediaRequest(event);
 if(command?.action!=="upload-chat-image")throw new ChatUploadMembershipError("Invalid image authorization.",401);
 const endpoint=chatUploadMembershipEndpoint(command.relay);
 if(!endpoint)return;
 if(active>=8)throw unavailable();
 active++;
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 const operation=check(endpoint,event,controller.signal).finally(()=>{active--;});
 try{
  await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable());},5000);})]);
 }catch(error){throw error instanceof ChatUploadMembershipError?error:unavailable();}
 finally{clearTimeout(timer);}
}
