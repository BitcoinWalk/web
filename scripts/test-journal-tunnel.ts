import {readFileSync} from "node:fs";
import {createHash,randomUUID} from "node:crypto";
import assert from "node:assert/strict";
import {RemoteJournalClient} from "../src/rustress/remote-journal-client";

// This harness cannot activate the journal: no operator credential on app host.
const root="/home/bitcoinwalk/.config/bitcoinwalk-journal-tunnel";
const pin=JSON.parse(readFileSync(`${root}/fixture-pin.json`,"utf8"));
const binding=createHash("sha256").update("bitcoinwalk-isolated-journal-staging-no-wallet-v1").digest("hex");
assert.equal(pin.binding,binding);
const token=readFileSync(`${root}/client.token`,"utf8").trim();
const client=new RemoteJournalClient("http://127.0.0.1:18891",token,pin.serviceId,binding);
async function main(){
 if(process.argv[2]==="outage"){
  await assert.rejects(()=>client.status());
  console.log("Journal outage refused: no acknowledgement or send permission.");return;
 }
 const state=await client.status();
 assert.equal((await fetch("http://127.0.0.1:18891/v1/journal/status",{signal:AbortSignal.timeout(5000)})).status,403);
 assert.equal((await fetch("http://127.0.0.1:18891/v1/journal/control",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({serviceId:pin.serviceId,expectedFence:state.fence,action:"activate"}),signal:AbortSignal.timeout(5000)})).status,403);
 const claim={serviceId:pin.serviceId,binding,fence:state.fence!,id:randomUUID(),hash:createHash("sha256").update(randomUUID()).digest("hex"),commitment:"d".repeat(64)};
 if(process.argv[2]==="paused"){
  assert.equal(state.active,false);await assert.rejects(()=>client.claim(claim));
  console.log("Pinned journal reachable, paused and refusing claims; operator access denied.");return;
 }
 assert.equal(process.argv[2],"claim");assert.equal(state.active,true);
 assert.equal((await client.claim(claim)).outcome,"created");
 assert.equal((await client.claim(claim)).outcome,"recorded");
 await assert.rejects(()=>client.claim({...claim,commitment:"e".repeat(64)}));
 const page=await client.page();assert.ok(page.entries.some(e=>e.id===claim.id));
 console.log("Cross-host synthetic journal claim/read-back/retry/conflict checks passed. No wallet used.");
}
void main().catch(()=>{console.error("Journal tunnel acceptance failed; keep sending disabled.");process.exitCode=1;});
