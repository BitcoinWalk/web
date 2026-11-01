import assert from "node:assert/strict";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../src/nostr/authority";
import {readCityBrandAutomationPolicy} from "../src/nostr/city-brand-automation";
import {authorizeCityBrand,readCityBrand,type CityBrandAuthority,type CityBrandChallenge} from "../src/nostr/city-brand";
import {CityBrandStore} from "../src/directory/city-brand-store";
import {CityBrandAutomationStore} from "../src/server/city-brand-automation-store";

const CITY="ca20993a-5b7f-443e-931e-8dbaa61d05fe";
const REQUEST="1dc081f8-7d17-49d9-8065-9856135127e5";
const EVENT="7f18e9dce83d71a4ceb8457e355ca370855d82cb8b00a07872674cd99fd11329";
const POLICY="421b0288e566b1433d7a6f18e30f1fcb3ff2ab963b2e3df988a07d56f9f562ec";
const RELAY="wss://relay-staging.bitcoinwalk.org/";

function protectedFile(path:string,maximum:number){
 const stat=lstatSync(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&stat.size<=maximum,`${path} must be an owner-only regular file`);
}
function rejected(action:()=>unknown,pattern:RegExp){assert.throws(action,pattern);}
function savepoint(db:DatabaseSync,name:string,action:()=>void){
 db.exec(`SAVEPOINT ${name}`);try{action();}finally{db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);}
}

const database=process.env.BITCOINWALK_REHEARSAL_DATABASE,policyPath=process.env.BITCOINWALK_REHEARSAL_POLICY;
assert(database&&policyPath,"Use an isolated database copy and signed policy.");
protectedFile(database,256*1024*1024);protectedFile(policyPath,16_384);
assert(realpathSync(database).startsWith("/tmp/"),"Refusing to rehearse against a non-temporary database.");

const db=new DatabaseSync(database),automationKey=process.env.NEXT_PUBLIC_CITY_BRAND_AUTOMATION_PUBKEY;
try{
 const row=db.prepare("SELECT challenge,status,owner_proof,brand_proof,approved_event FROM city_brand_request WHERE id=?").get(REQUEST) as
  {challenge:string;status:string;owner_proof:string;brand_proof:string;approved_event:string}|undefined;
 assert(row&&row.status==="active"&&row.owner_proof&&row.brand_proof&&row.approved_event,"Madeira active evidence is incomplete.");
 const challenge=JSON.parse(row.challenge) as CityBrandChallenge,authority=challenge.authority;
 const ownerProof=JSON.parse(row.owner_proof) as Event,brandProof=JSON.parse(row.brand_proof) as Event,approved=JSON.parse(row.approved_event) as Event;
 assert.equal(challenge.authority.cityId,CITY);assert.equal(approved.id,EVENT);
 assert.deepEqual({...db.prepare("SELECT event_id,relays FROM city_brand_publication WHERE request_id=?").get(REQUEST) as object},{event_id:EVENT,relays:JSON.stringify([RELAY])});
 assert.deepEqual({...db.prepare("SELECT policy_id,event_id,state FROM city_brand_automation_audit WHERE request_id=?").get(REQUEST) as object},{policy_id:POLICY,event_id:EVENT,state:"published"});

 const policyEvent=JSON.parse(readFileSync(policyPath,"utf8")) as Event,policy=readCityBrandAutomationPolicy(policyEvent,"staging");
 assert.equal(policyEvent.id,POLICY);assert.equal(policy.maximumCities,1);
 rejected(()=>readCityBrandAutomationPolicy(policyEvent,"production"),/environment/);

 delete process.env.NEXT_PUBLIC_CITY_BRAND_AUTOMATION_PUBKEY;
 rejected(()=>readCityBrand(approved),/Unapproved/);
 process.env.NEXT_PUBLIC_CITY_BRAND_AUTOMATION_PUBKEY=policy.automationPubkey;
 assert.deepEqual(readCityBrand(approved),challenge.binding);

 const now=challenge.issuedAt+1;
 rejected(()=>authorizeCityBrand({challenge,currentAuthority:{...authority,ownerPubkey:"0".repeat(64)},previous:null,ownerProof,brandProof,now}),/changed/);
 const replay={...challenge,requestId:"00000000-0000-4000-8000-000000000078"};
 rejected(()=>authorizeCityBrand({challenge:replay,currentAuthority:authority,previous:null,ownerProof,brandProof,now}),/proof/);

 const audit=new CityBrandAutomationStore(db,()=>now);
 audit.plan(policyEvent,policy,REQUEST,CITY);
 rejected(()=>audit.plan(policyEvent,policy,"00000000-0000-4000-8000-000000000079","00000000-0000-4000-8000-000000000079"),/limit/);

 savepoint(db,"moderation",()=>{
  db.prepare("UPDATE city_brand_request SET status='cancelled' WHERE id=?").run(REQUEST);
  const store=new CityBrandStore(db,()=>now);
  rejected(()=>store.approvedForPublication(REQUEST,SUPER_ADMIN_PUBKEY,authority),/privately approved/);
  assert.equal((db.prepare("SELECT status FROM city_brand_request WHERE id=?").get(REQUEST) as {status:string}).status,"cancelled");
 });

 savepoint(db,"authority_change",()=>{
  const store=new CityBrandStore(db,()=>now),changed:CityBrandAuthority={...authority,approvalEventId:"0".repeat(64)};
  rejected(()=>store.approvedForPublication(REQUEST,SUPER_ADMIN_PUBKEY,changed),/changed/);
 });

 db.prepare("DELETE FROM city_brand_publication WHERE request_id=?").run(REQUEST);
 db.prepare("UPDATE city_brand_request SET status='approved' WHERE id=?").run(REQUEST);
 db.prepare("UPDATE city_brand_automation_audit SET state='approved',detail='exact initial binding approved' WHERE request_id=?").run(REQUEST);
 const store=new CityBrandStore(db,()=>now);
 rejected(()=>store.activate(REQUEST,SUPER_ADMIN_PUBKEY,authority,[],[RELAY]),/read-back/);
 assert.equal((db.prepare("SELECT status FROM city_brand_request WHERE id=?").get(REQUEST) as {status:string}).status,"approved");
 const recovered=store.activate(REQUEST,SUPER_ADMIN_PUBKEY,authority,[approved],[RELAY]);
 assert.equal(recovered.event.id,EVENT);assert.equal(recovered.row.status,"active");
 assert.equal(store.activate(REQUEST,SUPER_ADMIN_PUBKEY,authority,[approved],[RELAY]).event.id,EVENT);
 assert.equal((db.prepare("SELECT COUNT(*) total FROM city_brand_publication WHERE request_id=?").get(REQUEST) as {total:number}).total,1);

 assert.deepEqual({...db.prepare("SELECT status FROM city_brand_request WHERE id=?").get(REQUEST) as object},{status:"active"});
 assert.deepEqual({...db.prepare("SELECT event_id,relays FROM city_brand_publication WHERE request_id=?").get(REQUEST) as object},{event_id:EVENT,relays:JSON.stringify([RELAY])});
 console.log(JSON.stringify({result:"BW78_FAIL_CLOSED_REHEARSAL_OK",liveDatabaseTouched:false,cases:["wrong-owner","stale-proof-replay","policy-environment","policy-revocation","capacity-replay","moderation-wins","authority-change","missing-readback","interrupted-publication-recovery","exact-retry"]}));
}finally{
 if(automationKey===undefined)delete process.env.NEXT_PUBLIC_CITY_BRAND_AUTOMATION_PUBKEY;else process.env.NEXT_PUBLIC_CITY_BRAND_AUTOMATION_PUBKEY=automationKey;
 db.close();
}
