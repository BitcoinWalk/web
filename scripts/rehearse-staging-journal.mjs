// Fixed fixture paths. No wallet adapter or live endpoint exists in this script.
import {readFile,writeFile,mkdir,copyFile,stat} from "node:fs/promises";
import {execFileSync,spawn} from "node:child_process";
import {createHash,randomUUID,randomBytes} from "node:crypto";
import {once} from "node:events";
import assert from "node:assert/strict";

assert.notEqual(process.getuid(),0);
const base="/home/bitcoinwalk/journal-staging-0.1.0";
const state=`${base}/state`;
const config=JSON.parse(await readFile(`${state}/config.json`,"utf8"));
assert.equal(config.binding,createHash("sha256").update("bitcoinwalk-isolated-journal-staging-no-wallet-v1").digest("hex"));
const client=(await readFile(`${state}/client.token`,"utf8")).trim();
const operator=(await readFile(`${state}/operator.token`,"utf8")).trim();
const env={...process.env,XDG_RUNTIME_DIR:`/run/user/${process.getuid()}`,DBUS_SESSION_BUS_ADDRESS:`unix:path=/run/user/${process.getuid()}/bus`};
const ctl=action=>execFileSync("systemctl",["--user",action,"bitcoinwalk-journal-staging.service"],{env,stdio:"pipe"});
const call=async(path,body,token=client,port=8891)=>{
 const r=await fetch(`http://127.0.0.1:${port}/v1/journal/${path}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(3000)});
 return {status:r.status,body:await r.json()};
};
const ready=async()=>{for(let i=0;i<30;i++){try{return (await call("status")).body;}catch{await new Promise(r=>setTimeout(r,100));}}throw new Error("Service unavailable");};
const activate=async(s,token=operator,port=8891)=>(await call("control",{serviceId:s.serviceId,expectedFence:s.fence,action:"activate"},token,port)).body;
let restored;
try{
 if(process.argv[2]==="backup"){
  let s=await ready();assert.equal(s.active,false);assert.equal(s.lastSequence,0);
  assert.equal((await call("status",undefined,"invalid")).status,403);
  s=await activate(s);assert.equal(s.active,true);
  const claim={serviceId:s.serviceId,binding:s.binding,fence:s.fence,id:randomUUID(),hash:"b".repeat(64),commitment:"c".repeat(64)};
  assert.equal((await call("claim",claim)).body.outcome,"created");
  assert.equal((await call("claim",claim)).body.outcome,"recorded");
  await writeFile(`${base}/fixture-claim.json`,JSON.stringify(claim),{mode:0o600});
  ctl("stop");
  await assert.rejects(()=>call("status"));
  const backup=`${base}/backup`;await mkdir(backup,{mode:0o700});
  await copyFile(`${state}/journal.sqlite`,`${backup}/journal.sqlite`);
  assert.equal((await stat(`${backup}/journal.sqlite`)).mode&0o777,0o600);
  ctl("start");s=await ready();assert.equal(s.active,false);assert.equal(s.serviceId,claim.serviceId);assert.equal(s.lastSequence,1);
  assert.equal((await call("claim",claim)).status,409);
  console.log("Fixture auth/claim/retry/outage/restart passed. Stopped-database backup ready; service paused.");
 }else if(process.argv[2]==="restore"){
  const dir=`${base}/restore`; // DB must have completed the off-host round trip first.
  assert.equal((await stat(`${dir}/journal.sqlite`)).mode&0o777,0o600);
  const restoredClient=randomBytes(32).toString("base64url"),restoredOperator=randomBytes(32).toString("base64url");
  await writeFile(`${dir}/config.json`,JSON.stringify({...config,port:8892}),{mode:0o600});
  await writeFile(`${dir}/client.token`,restoredClient,{mode:0o600});
  await writeFile(`${dir}/operator.token`,restoredOperator,{mode:0o600});
  restored=spawn(process.execPath,[`${base}/bitcoinwalk-remote-journal-0.1.0/journal.cjs`,dir],{stdio:["ignore","pipe","pipe"]});
  await Promise.race([once(restored.stdout,"data"),once(restored,"exit").then(()=>{throw new Error("Restore refused");}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error("Restore timeout")),5000);t.unref();})]);
  let s=(await call("status",undefined,restoredClient,8892)).body;
  const claim=JSON.parse(await readFile(`${base}/fixture-claim.json`,"utf8"));
  assert.equal(s.active,false);assert.equal(s.serviceId,claim.serviceId);assert.equal(s.lastSequence,1);
  assert.equal((await call("claim",claim,restoredClient,8892)).status,409);
  s=await activate(s,restoredOperator,8892);
  assert.equal((await call("claim",{...claim,fence:s.fence},restoredClient,8892)).body.outcome,"recorded");
  await call("control",{serviceId:s.serviceId,expectedFence:s.fence,action:"pause"},restoredOperator,8892);
  const exited=once(restored,"exit");restored.kill("SIGTERM");assert.equal((await exited)[0],0);restored=undefined;
  assert.equal((await call("status")).body.active,false);
  console.log("Off-host backup restore passed: identity/record retained, stale fence denied, retry never granted a new send. Original service paused; restore process stopped.");
 }else throw new Error("Expected backup or restore mode");
}finally{
 if(restored){restored.kill("SIGTERM");await once(restored,"exit");}
 const s=await ready();if(s.active)await call("control",{serviceId:s.serviceId,expectedFence:s.fence,action:"pause"},operator);
}
