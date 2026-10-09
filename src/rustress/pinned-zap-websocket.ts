import type {LookupFunction} from "node:net";
import WebSocket from "ws";
import type {PinnedRelayTransport} from "./zap-relay-publisher";

type Listener=(...args:unknown[])=>void;
type Socket={
 on:(event:string,listener:Listener)=>Socket;
 send:(data:string,callback:(error?:Error)=>void)=>void;
 close:()=>void;
 terminate:()=>void;
};
export type PinnedSocketOptions={servername:string;rejectUnauthorized:true;followRedirects:false;perMessageDeflate:false;handshakeTimeout:number;maxPayload:number;lookup:LookupFunction};
type Factory=(url:string,options:PinnedSocketOptions)=>Socket;
type LookupCallback={
 (error:NodeJS.ErrnoException|null,address:string,family:number):void;
 (error:NodeJS.ErrnoException|null,addresses:Array<{address:string;family:number}>):void;
};

function messageText(value:unknown){
 if(typeof value==="string")return value;
 if(Buffer.isBuffer(value))return value.toString("utf8");
 if(value instanceof ArrayBuffer)return Buffer.from(value).toString("utf8");
 return "";
}

/** Publishes one exact Nostr event over TLS. The socket lookup callback returns
 * only addresses approved by the relay policy, while `servername` preserves
 * certificate and SNI verification for the original hostname. */
export class PinnedZapWebSocketTransport implements PinnedRelayTransport{
 constructor(private factory:Factory=(url,options)=>new WebSocket(url,options) as unknown as Socket){}

 async send(input:Parameters<PinnedRelayTransport["send"]>[0]){
  const url=new URL(input.url),hostname=url.hostname.replace(/^\[|\]$/g,"");
  if(url.protocol!=="wss:"||input.addresses.length<1||input.addresses.length>8||input.timeoutMs<1000||input.timeoutMs>15000)throw new Error("Invalid pinned relay request");
  let index=0;
  const lookup=((requested:string,options:unknown,callback:LookupCallback)=>{
   if(requested!==hostname)return callback(new Error("Relay hostname changed"),"",0);
   if(typeof options==="object"&&options!==null&&"all" in options&&options.all===true)return callback(null,input.addresses.map(row=>({address:row.address,family:row.family})));
   const row=input.addresses[index++%input.addresses.length];
   return callback(null,row.address,row.family);
  }) as LookupFunction;

  return new Promise<boolean>((resolve,reject)=>{
   let complete=false,socket:Socket|undefined;
   const done=(error?:Error,result=false)=>{
    if(complete)return;
    complete=true;
    clearTimeout(timer);
    try{socket?.close();}catch{}
    if(error)reject(error);else resolve(result);
   };
   const timer=setTimeout(()=>{try{socket?.terminate();}catch{}done(new Error("Relay acknowledgement timeout"));},input.timeoutMs);
   timer.unref?.();
   try{
    socket=this.factory(input.url,{servername:hostname,rejectUnauthorized:true,followRedirects:false,perMessageDeflate:false,handshakeTimeout:input.timeoutMs,maxPayload:16384,lookup});
    socket.on("open",()=>socket!.send(JSON.stringify(["EVENT",input.event]),error=>error?done(error):undefined));
    socket.on("message",(value:unknown,binary:unknown)=>{
     try{
      if(binary===true)throw new Error();
      const text=messageText(value);
      if(!text||Buffer.byteLength(text)>16384)throw new Error();
      const message:unknown=JSON.parse(text);
      if(!Array.isArray(message)||message.length<3||message[0]!=="OK"||message[1]!==input.event.id||typeof message[2]!=="boolean")throw new Error();
      if(message[2]!==true)return done(new Error("Relay rejected receipt"));
      done(undefined,true);
     }catch{done(new Error("Invalid relay acknowledgement"));}
    });
    socket.on("unexpected-response",()=>done(new Error("Relay handshake rejected")))
     .on("error",(value:unknown)=>done(value instanceof Error?value:new Error("Relay error")))
     .on("close",()=>done(new Error("Relay closed before acknowledgement")));
   }catch(error){done(error instanceof Error?error:new Error("Relay connection failed"));}
  });
 }
}
