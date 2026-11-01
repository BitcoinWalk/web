import assert from "node:assert/strict";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {ActivationWorkflow} from "../src/rustress/activation-workflow";
import {RustressActivator} from "../src/rustress/client";
import {managedProvisionConfigSchema,provisionDigest} from "../src/rustress/contract";
import {loopbackApiTransport} from "../src/rustress/loopback-http";
import {verifyCityLnurl,verifyCityNip05} from "../src/rustress/public-provisioning";
import {resolveRustressActivationEvidence} from "../src/server/pro-setup";

const DATABASE="/var/lib/bitcoinwalk-app-staging/payments.sqlite",CITY="5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd";
const EXPECTED_HASH="c2711193bceb4c94a2660ae3955ad1fb45603b51b1fe692c2b60f4898a93b111";
async function main(){
 assert(process.getuid?.()!==0);assert.equal(realpathSync(DATABASE),DATABASE);assert.equal(process.env.BITCOINWALK_PAYMENT_DATABASE,DATABASE);
 assert.equal(process.env.BITCOINWALK_RUSTRESS_PAYOUT_ENROLMENT_ENABLED,"0");
 const tokenFile=process.env.BITCOINWALK_RUSTRESS_MANAGED_TOKEN_FILE??"",stat=lstatSync(tokenFile);
 assert(stat.isFile()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&stat.size<=1024,"Protected managed token required.");
 const db=new DatabaseSync(DATABASE);try{
  const row=db.prepare("SELECT request,activation_config,phase,nip05,lnurl,lease,until FROM rustress_activation_task WHERE city=?").get(CITY) as {request:string;activation_config:string;phase:string;nip05:string;lnurl:string;lease:string|null;until:number}|undefined;
  assert(row&&row.phase==="unknown"&&row.nip05==="active"&&row.lnurl==="active"&&!row.lease&&row.until<=Date.now(),"Islamabad is not in the exact recoverable state.");
  const config=managedProvisionConfigSchema.parse(JSON.parse(row.activation_config));assert.equal(provisionDigest(config),EXPECTED_HASH);
  const options={origin:process.env.BITCOINWALK_RUSTRESS_MANAGED_ORIGIN??"",token:readFileSync(tokenFile,"utf8").trim(),domain:"bitcoinwalk.org",adapterRevision:process.env.BITCOINWALK_RUSTRESS_MANAGED_REVISION??""};
  const activation=new RustressActivator(options,loopbackApiTransport(options.origin,options.domain)),receipt=await activation.status(config);
  assert.deepEqual({state:receipt.state,hash:receipt.configHash},{state:"applied",hash:EXPECTED_HASH});
  const fresh=await resolveRustressActivationEvidence(row.request,"https://bitcoinwalk.org",config);assert.equal(JSON.stringify(fresh.activation),JSON.stringify(config));
  await Promise.all([verifyCityNip05({publicOrigin:fresh.publicOrigin,...config}),verifyCityLnurl({publicOrigin:fresh.publicOrigin,...config})]);
  const workflow=new ActivationWorkflow(db,{status:async()=>{throw new Error("Reservation read-back must not run for an applied recovery.");}},activation,
   {nip05:verifyCityNip05,lnurl:verifyCityLnurl},(request,current)=>resolveRustressActivationEvidence(request,"https://bitcoinwalk.org",current));
  const recovered=await workflow.retry(CITY);assert.deepEqual(recovered&&{state:recovered.state,nip05:recovered.nip05,lnurl:recovered.lnurl},{state:"active",nip05:"active",lnurl:"active"});
  console.log(JSON.stringify({result:"ISLAMABAD_EXACT_ACTIVATION_RECOVERED",cityId:CITY,configHash:EXPECTED_HASH,providerWrite:false,payoutEnrolment:false}));
 }finally{db.close();}
}
void main().catch(error=>{console.error(JSON.stringify({result:"ISLAMABAD_EXACT_ACTIVATION_RECOVERY_FAILED",reason:error instanceof Error?error.message:"unknown"}));process.exitCode=1;});
