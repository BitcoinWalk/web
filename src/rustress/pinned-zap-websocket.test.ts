import {finalizeEvent} from "nostr-tools";
import {describe,expect,it,vi} from "vitest";
import type {LookupFunction} from "node:net";
import {PinnedZapWebSocketTransport,type PinnedSocketOptions} from "./pinned-zap-websocket";

type Listener=(...args:unknown[])=>void;
const event=finalizeEvent({kind:9735,created_at:1_800_000_000,content:"",tags:[["p","ab".repeat(32)],["bolt11","invoice"],["description","{}"]]},new Uint8Array(32).fill(4));
class FakeSocket{
 handlers=new Map<string,Listener[]>();sent:string[]=[];closed=false;terminated=false;
 on(name:string,handler:Listener){this.handlers.set(name,[...(this.handlers.get(name)??[]),handler]);return this;}
 emit(name:string,...args:unknown[]){for(const handler of this.handlers.get(name)??[])handler(...args);}
 send(value:string,callback:(error?:Error)=>void){this.sent.push(value);callback();}
 close(){this.closed=true;}
 terminate(){this.terminated=true;}
}
function fixture(){
 const socket=new FakeSocket();let captured:PinnedSocketOptions|undefined;
 const factory=vi.fn((_url:string,options:PinnedSocketOptions)=>{captured=options;return socket;}),transport=new PinnedZapWebSocketTransport(factory);
 return {socket,factory,transport,options:()=>{if(!captured)throw new Error("not opened");return captured;},input:{url:"wss://relay.example/path",addresses:[{address:"1.1.1.1",family:4 as const},{address:"2606:4700:4700::1111",family:6 as const}],event,timeoutMs:1000}};
}
function lookupOne(lookup:LookupFunction,host:string){return new Promise<{address:string;family:number}>((resolve,reject)=>lookup(host,{},(error,address,family)=>{if(error)return reject(error);if(typeof address!=="string"||family===undefined)return reject(new Error("unexpected lookup result"));resolve({address,family});}));}
function lookupAll(lookup:LookupFunction,host:string){return new Promise<Array<{address:string;family:number}>>((resolve,reject)=>lookup(host,{all:true},(error,addresses)=>{if(error)return reject(error);if(!Array.isArray(addresses))return reject(new Error("unexpected lookup result"));resolve(addresses);}));}
describe("pinned zap WebSocket transport",()=>{
 it("pins approved addresses while preserving TLS hostname and accepts only exact OK",async()=>{
  const f=fixture(),pending=f.transport.send(f.input),options=f.options();
  expect(options).toMatchObject({servername:"relay.example",rejectUnauthorized:true,followRedirects:false,perMessageDeflate:false,maxPayload:16384});
  await expect(lookupOne(options.lookup,"relay.example")).resolves.toEqual({address:"1.1.1.1",family:4});
  f.socket.emit("open");expect(JSON.parse(f.socket.sent[0])).toEqual(["EVENT",JSON.parse(JSON.stringify(event))]);
  f.socket.emit("message",Buffer.from(JSON.stringify(["OK",event.id,true,"saved"])),false);
  await expect(pending).resolves.toBe(true);expect(f.socket.closed).toBe(true);
 });
 it("supports all-address lookup without resolving DNS again",async()=>{
  const f=fixture(),pending=f.transport.send(f.input),lookup=f.options().lookup;
  await expect(lookupAll(lookup,"relay.example")).resolves.toEqual(f.input.addresses);
  f.socket.emit("error",new Error("stop"));await expect(pending).rejects.toThrow("stop");
 });
 it.each([["OK","ff".repeat(32),true],["OK",event.id,false],["NOTICE","no"],{"bad":true}])("rejects invalid or negative acknowledgement %j",async message=>{
  const f=fixture(),pending=f.transport.send(f.input);f.socket.emit("open");f.socket.emit("message",Buffer.from(JSON.stringify(message)),false);await expect(pending).rejects.toThrow();
 });
 it("rejects hostname substitution in the socket lookup",async()=>{
  const f=fixture(),pending=f.transport.send(f.input),lookup=f.options().lookup;
  await expect(lookupOne(lookup,"attacker.example")).rejects.toThrow("hostname changed");
  f.socket.emit("error",new Error("stop"));await expect(pending).rejects.toThrow("stop");
 });
 it("rejects plaintext, empty pins and excessive timeouts before opening a socket",async()=>{
  const f=fixture();await expect(f.transport.send({...f.input,url:"ws://relay.example"})).rejects.toThrow();await expect(f.transport.send({...f.input,addresses:[]})).rejects.toThrow();await expect(f.transport.send({...f.input,timeoutMs:20000})).rejects.toThrow();expect(f.factory).not.toHaveBeenCalled();
 });
 it("fails closed on binary messages and connection errors",async()=>{
  const f=fixture(),pending=f.transport.send(f.input);f.socket.emit("message",Buffer.from("[]"),true);await expect(pending).rejects.toThrow("Invalid relay acknowledgement");
  const g=fixture(),other=g.transport.send(g.input);g.socket.emit("error",new Error("offline"));await expect(other).rejects.toThrow("offline");
 });
});
