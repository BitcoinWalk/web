import {spawn,execFileSync} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,mkdir,writeFile,chmod,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createServer} from "node:net";
import assert from "node:assert/strict";
import {once} from "node:events";

const temporary=await mkdtemp(join(tmpdir(),"bw-journal-smoke-"));
const state=join(temporary,"state");
const clientToken=randomBytes(32).toString("base64url"),operatorToken=randomBytes(32).toString("base64url");
let child;
try{
 execFileSync("tar",["-xzf",resolve("release-build/bitcoinwalk-remote-journal-0.1.0.tar.gz"),"-C",temporary]);
 const executable=join(temporary,"bitcoinwalk-remote-journal-0.1.0/journal.cjs");
 await mkdir(state,{mode:0o700});
 const reservation=createServer();reservation.listen(0,"127.0.0.1");await once(reservation,"listening");
 const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 await writeFile(join(state,"config.json"),JSON.stringify({binding:"a".repeat(64),port}),{mode:0o600});
 await writeFile(join(state,"client.token"),clientToken,{mode:0o600});
 await writeFile(join(state,"operator.token"),operatorToken,{mode:0o600});
 const launch=()=>spawn(process.execPath,[executable,state],{stdio:["ignore","pipe","pipe"]});
 const start=async()=>{
  child=launch();
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error("Startup timeout")),5000);
   child.once("exit",()=>{clearTimeout(timer);reject(new Error("Startup refused"));});
   child.stdout.once("data",()=>{clearTimeout(timer);resolve();});
  });
 };
 const stop=async()=>{const exited=once(child,"exit");child.kill("SIGTERM");assert.equal((await exited)[0],0);child=undefined;};
 const call=async(path,body,token=clientToken)=>{
  const r=await fetch(`http://127.0.0.1:${port}/v1/journal/${path}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
  return {status:r.status,body:await r.json()};
 };
 await start();
 assert.equal((await call("status",undefined,"wrong")).status,403);
 let s=(await call("status")).body;assert.equal(s.active,false);
 const identity=s.serviceId;
 assert.equal((await call("control",{serviceId:identity,expectedFence:s.fence,action:"activate"})).status,403);
 s=(await call("control",{serviceId:identity,expectedFence:s.fence,action:"activate"},operatorToken)).body;
 assert.equal(s.active,true);
 const second=launch();assert.equal((await once(second,"exit"))[0],1);
 assert.equal((await call("status")).body.active,true); // Lock refusal must not pause owner.
 const claim={serviceId:identity,binding:s.binding,fence:s.fence,id:randomUUID(),hash:"b".repeat(64),commitment:"c".repeat(64)};
 assert.equal((await call("claim",claim)).body.outcome,"created");
 assert.equal((await call("claim",claim)).body.outcome,"recorded");
 assert.equal((await stat(join(state,"journal.sqlite"))).mode&0o777,0o600);
 await stop();await start();
 s=(await call("status")).body;assert.equal(s.serviceId,identity);assert.equal(s.active,false);assert.equal(s.lastSequence,1);
 assert.equal((await call("claim",claim)).status,409);
 s=(await call("control",{serviceId:identity,expectedFence:s.fence,action:"activate"},operatorToken)).body;
 assert.equal((await call("claim",{...claim,fence:s.fence})).body.outcome,"recorded");
 await stop();
 await chmod(join(state,"client.token"),0o644);
 const insecure=launch();assert.equal((await once(insecure,"exit"))[0],1);
 console.log("Packaged journal smoke passed: auth, lock, durable retry, paused restart, permissions. No wallet used.");
}finally{
 if(child){const exited=once(child,"exit");child.kill("SIGKILL");await exited;}
 await rm(temporary,{recursive:true,force:true});
}
