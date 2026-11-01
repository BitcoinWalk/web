import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync,backup} from "node:sqlite";
import {managedProvisionConfigSchema,provisionDigest,type ProvisionConfig} from "../src/rustress/contract";
import {PayoutAuthorityStore,PAYOUT_AUTHORITY_API} from "../src/rustress/payout-authority";
import {PayoutEnrolmentError,PayoutEnrolmentWorkflow,type PayoutAuthorityProvider,type PayoutAuthorityReceipt} from "../src/rustress/payout-enrolment";
import {verifyCityPublicProvisioning} from "../src/rustress/public-provisioning";
import {VERIFIED_PRO_CITY_SCOPE} from "../src/rustress/scoped-payout-operation";

const SOURCE="/var/lib/bitcoinwalk-app-staging/payments.sqlite";
const CITIES=[
 {name:"Bangkok",id:"d7d1cda8-7a58-42ad-ab60-c4bad61dab9a"},
 {name:"Islamabad",id:"5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd"},
] as const;
type ActivationRow={request:string;activation_config:string;phase:string;nip05:string;lnurl:string};

function row(db:DatabaseSync,cityId:string){return db.prepare("SELECT request,activation_config,phase,nip05,lnurl FROM rustress_activation_task WHERE city=?").get(cityId) as ActivationRow|undefined;}
function provider(store:PayoutAuthorityStore,calls:{register:number},unknownOnce=false):PayoutAuthorityProvider{
 let unknown=unknownOnce;
 return {
  status:async config=>{const receipt=store.record(config.cityId,config.payoutVersion);if(!receipt)throw new PayoutEnrolmentError("absent");return receipt as PayoutAuthorityReceipt;},
  register:async config=>{calls.register++;const receipt=store.register(config) as PayoutAuthorityReceipt;if(unknown){unknown=false;throw new PayoutEnrolmentError("unknown");}return receipt;},
 };
}

async function main(){
 assert(process.getuid?.()!==0,"Run the rehearsal as the non-root bitcoinwalk user.");
 assert.equal(process.env.BITCOINWALK_RUSTRESS_PAYOUT_ENROLMENT_ENABLED,"0","Real payout enrolment must be explicitly disabled.");
 assert.equal(realpathSync(SOURCE),SOURCE,"Exact staging database required.");
 const directory=mkdtempSync("/var/lib/bitcoinwalk-app-staging/bw148-rehearsal-"),copy=join(directory,"staging.sqlite"),isolated=join(directory,"isolated.sqlite"),changed=join(directory,"changed.sqlite"),revoked=join(directory,"revoked.sqlite");
 let source:DatabaseSync|undefined,read:DatabaseSync|undefined,work:DatabaseSync|undefined;
 try{
  source=new DatabaseSync(SOURCE,{readOnly:true});await backup(source,copy);source.close();source=undefined;
  process.env.BITCOINWALK_PAYMENT_DATABASE=copy;
  const {resolveRustressActivationEvidence}=await import("../src/server/pro-setup");
  read=new DatabaseSync(copy,{readOnly:true});
  const configs=new Map<string,ProvisionConfig>();
  for(const city of CITIES){
   const current=row(read,city.id);assert(current,`${city.name} activation is absent.`);
   assert.deepEqual({phase:current.phase,nip05:current.nip05,lnurl:current.lnurl},{phase:"active",nip05:"active",lnurl:"active"},`${city.name} is not currently eligible.`);
   const config=managedProvisionConfigSchema.parse(JSON.parse(current.activation_config));
   assert.equal(config.cityId,city.id);assert.equal(config.invoiceIssuance,"enabled");configs.set(city.id,config);
  }
  const fresh=async(candidate:ProvisionConfig)=>{
   const current=row(read!,candidate.cityId);assert(current&&current.phase==="active"&&current.nip05==="active"&&current.lnurl==="active","Live staging eligibility changed.");
   const stored=managedProvisionConfigSchema.parse(JSON.parse(current.activation_config));assert.equal(JSON.stringify(stored),JSON.stringify(candidate),"Live staging activation changed.");
   const evidence=await resolveRustressActivationEvidence(current.request,"https://bitcoinwalk.org",candidate);
   assert.equal(JSON.stringify(evidence.activation),JSON.stringify(candidate),"Fresh authority evidence changed.");
   await verifyCityPublicProvisioning({publicOrigin:"https://bitcoinwalk.org",domain:candidate.domain,localPart:candidate.localPart,brandPubkey:candidate.brandPubkey});
   return evidence.activation;
  };

  work=new DatabaseSync(isolated);const authority=new PayoutAuthorityStore(work,{cityScope:VERIFIED_PRO_CITY_SCOPE,maximumCities:2}),calls={register:0};
  let workflow=new PayoutEnrolmentWorkflow(work,provider(authority,calls,true),fresh);
  for(const config of configs.values())workflow.enqueue(config);
  const first=CITIES[0],second=CITIES[1];
  assert.equal((await workflow.run(first.id))?.state,"unknown");assert.equal((await workflow.run(first.id))?.state,"active");
  assert.equal((await workflow.run(second.id))?.state,"active");assert.equal(calls.register,2);assert.equal(authority.count(),2);
  work.close();work=undefined;

  work=new DatabaseSync(isolated);const restartedAuthority=new PayoutAuthorityStore(work,{cityScope:VERIFIED_PRO_CITY_SCOPE,maximumCities:2}),restartCalls={register:0};
  workflow=new PayoutEnrolmentWorkflow(work,provider(restartedAuthority,restartCalls),fresh);
  for(const city of CITIES){assert.equal(workflow.status(city.id)?.state,"active");assert.equal((await workflow.run(city.id))?.state,"active");}
  assert.equal(restartCalls.register,0,"Restart repeated a completed registration.");

  const changedDb=new DatabaseSync(changed),changedCalls={register:0},firstConfig=configs.get(first.id)!;
  const changedWorkflow=new PayoutEnrolmentWorkflow(changedDb,provider(new PayoutAuthorityStore(changedDb),changedCalls),async value=>({...value,payoutDestination:"changed@example.org"}));
  changedWorkflow.enqueue(firstConfig);assert.equal((await changedWorkflow.run(first.id))?.state,"blocked");assert.equal(changedCalls.register,0);changedDb.close();

  const revokedDb=new DatabaseSync(revoked),revokedCalls={register:0};
  const revokedWorkflow=new PayoutEnrolmentWorkflow(revokedDb,{status:async()=>{throw new PayoutEnrolmentError("absent");},register:async()=>{revokedCalls.register++;throw new PayoutEnrolmentError("rejected");}},async value=>value);
  revokedWorkflow.enqueue(firstConfig);assert.equal((await revokedWorkflow.run(first.id))?.state,"blocked");assert.equal(revokedCalls.register,1);revokedDb.close();

  const report={result:"BW148_NO_MONEY_STAGING_REHEARSAL_OK",api:PAYOUT_AUTHORITY_API,noMoney:true,liveDatabaseTouched:false,realAuthorityContacted:false,
   productionChanged:false,realPayoutEnrolmentEnabled:false,authorityScope:VERIFIED_PRO_CITY_SCOPE,maximumCities:2,registerCalls:calls.register,
   unknownWriteRecovered:true,restartDuplicateRegistrations:restartCalls.register,changedEvidenceBlocked:true,revokedPolicyBlocked:true,
   cities:CITIES.map(city=>{const config=configs.get(city.id)!;return {name:city.name,cityId:city.id,localPart:config.localPart,payoutVersion:config.payoutVersion,configHash:provisionDigest(config),state:"active"};})};
  console.log(JSON.stringify({...report,reportHash:createHash("sha256").update(JSON.stringify(report)).digest("hex")}));
 }finally{source?.close();read?.close();work?.close();rmSync(directory,{recursive:true,force:true});}
}
void main().catch(error=>{console.error(JSON.stringify({result:"BW148_NO_MONEY_STAGING_REHEARSAL_FAILED",reason:error instanceof Error?error.message:"unknown"}));process.exitCode=1;});
