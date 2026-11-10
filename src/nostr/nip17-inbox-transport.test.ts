import {once} from "node:events";
import {WebSocketServer} from "ws";
import {SimplePool,generateSecretKey,getPublicKey,finalizeEvent,verifyEvent} from "nostr-tools";
import {wrapEvent} from "nostr-tools/nip59";
import {it,expect} from "vitest";
import {readNip17Wraps} from "./nip17-inbox";

it("retrieves a private reply through the real relay library after a twelve-second signer approval",async()=>{
 const key=generateSecretKey(),pubkey=getPublicKey(key),event=wrapEvent({kind:14,tags:[["p",pubkey]],content:"Synthetic delayed signer test"},generateSecretKey(),pubkey);
 const server=new WebSocketServer({host:"127.0.0.1",port:0});await once(server,"listening");
 const address=server.address();if(typeof address==="string"||!address)throw new Error("No test listener.");
 const relay=`ws://127.0.0.1:${address.port}`,pool=new SimplePool();let authentications=0;
 server.on("connection",socket=>{
  let authenticated=false;socket.send(JSON.stringify(["AUTH","challenge"]));
  socket.on("message",bytes=>{
   const message=JSON.parse(bytes.toString());
   if(message[0]==="AUTH"){authenticated=verifyEvent(message[1])&&message[1].pubkey===pubkey;authentications++;socket.send(JSON.stringify(["OK",message[1].id,authenticated,""]));}
   if(message[0]==="REQ"){
    if(!authenticated)socket.send(JSON.stringify(["CLOSED",message[1],"auth-required: authenticate first"]));
    else{socket.send(JSON.stringify(["EVENT",message[1],event]));socket.send(JSON.stringify(["EOSE",message[1]]));}
   }
  });
 });
 try{
  const received=await readNip17Wraps(pool,pubkey,[relay],async template=>{await new Promise(resolve=>setTimeout(resolve,12000));return finalizeEvent(template,key);});
  expect(received.map(row=>row.id)).toEqual([event.id]);expect(authentications).toBe(1);
 }finally{pool.destroy();for(const client of server.clients)client.terminate();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
},20000);
