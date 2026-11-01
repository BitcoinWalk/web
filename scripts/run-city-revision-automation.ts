import {lstatSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {finalizeEvent,getPublicKey,type Event} from "nostr-tools";
import {relayConfig} from "../src/lib/relay-config";
import {SUPER_ADMIN_PUBKEY} from "../src/nostr/authority";
import {AUTOMATED_CITY_REVISION_NOTE} from "../src/nostr/city-revision-automation-contract";
import {queryAuthorizations,queryDirectoryRecords,queryRelayEvents,parseApprovalRecord,closeRelayReadPool} from "../src/nostr/city-records";
import {latestCityGrants} from "../src/nostr/editor-management";
import {latestEventModerations,organizerPublishingStatus,queryEventModerationsForCities} from "../src/nostr/event-moderation";
import {managedCities} from "../src/nostr/moderation";
import {adminCityRequests} from "../src/domain/admin-city-requests";
import {automatedCityRevisionDecision} from "../src/nostr/city-revision-automation";
import {readCityRevisionAutomationPolicy} from "../src/nostr/city-revision-automation-policy";
import {publishVerifiedEvent} from "../src/nostr/relay";
import {signTransportAuth} from "../src/guide/core";
import {CityRevisionAutomationStore} from "../src/server/city-revision-automation-store";

function protectedFile(path:string,maximum:number){const stat=lstatSync(path);if(!stat.isFile()||stat.mode&0o077||stat.size>maximum)throw new Error("Protected automation credential required.");return readFileSync(path,"utf8").trim();}

async function candidates(){
 const [directory,authorizations]=await Promise.all([queryDirectoryRecords(relayConfig.readRelays),queryAuthorizations(relayConfig.readRelays)]),current=new Map(managedCities(directory.revisions,directory.approvals).filter(row=>row.state==="approved").map(row=>[row.revision.city.cityId,row])),grants=new Map(latestCityGrants(authorizations).map(row=>[row.grant.cityId,row.grant])),pending=adminCityRequests(directory.revisions,directory.approvals).filter(row=>row.established&&row.status==="pending"),moderations=latestEventModerations(await queryEventModerationsForCities(relayConfig.readRelays,pending.map(row=>row.revision.city.cityId))),rows=[];
 for(const row of pending){const live=current.get(row.revision.city.cityId),grant=grants.get(row.revision.city.cityId);if(!live||!grant)continue;const citySuspended=moderations.some(record=>record.decision.scope==="city"&&record.decision.target===row.revision.city.cityId&&record.decision.status==="suspended"),organizerSuspended=await organizerPublishingStatus(relayConfig.readRelays,row.revision.event.pubkey).then(status=>status==="suspended");try{rows.push({row,template:automatedCityRevisionDecision({current:live,revision:row.revision,grant,citySuspended,organizerSuspended})});}catch{/* Non-eligible edits remain in Requests. */}}
 return rows;
}

async function main(){
 process.umask(0o077);const mode=process.argv[2];if(mode!=="--dry-run"&&mode!=="--run")throw new Error("Use --dry-run or --run.");
 if(process.env.BITCOINWALK_RUSTRESS_FIXTURE_ENABLED==="1"||process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED==="1")throw new Error("Revision automation cannot run with payment provisioning enabled.");
 const environment=process.env.BITCOINWALK_CITY_REVISION_AUTOMATION_ENVIRONMENT;
 if(environment!=="staging"&&environment!=="production")throw new Error("Run through the isolated city revision automation service.");
 const queue=await candidates();
 if(mode==="--dry-run"){console.log(JSON.stringify({mode:"dry-run",environment,candidates:queue.map(({row})=>({revisionId:row.revision.event.id,cityId:row.revision.city.cityId}))}));return;}
 const credentials=process.env.CREDENTIALS_DIRECTORY,database=process.env.BITCOINWALK_PAYMENT_DATABASE;
 if(!credentials||!database)throw new Error("Run through the isolated city revision automation service.");
 const policyEvent=JSON.parse(protectedFile(join(credentials,"policy.json"),16_384)) as Event,policy=readCityRevisionAutomationPolicy(policyEvent,environment);
 console.log(JSON.stringify({mode:"run",environment,policyId:policyEvent.id,maximumRevisions:policy.maximumRevisions,candidates:queue.map(({row})=>({revisionId:row.revision.event.id,cityId:row.revision.city.cityId}))}));
 if(!relayConfig.writeRelays.length)throw new Error("No city revision publication relay is configured.");
 const raw=protectedFile(join(credentials,"signer-key"),66);if(!/^[0-9a-f]{64}$/.test(raw))throw new Error("Invalid automation credential.");const secret=Uint8Array.from(Buffer.from(raw,"hex")),db=new DatabaseSync(database),store=new CityRevisionAutomationStore(db);
 try{
  if(getPublicKey(secret)!==policy.automationPubkey||policy.automationPubkey===SUPER_ADMIN_PUBKEY||process.env.NEXT_PUBLIC_CITY_REVISION_AUTOMATION_PUBKEY!==policy.automationPubkey)throw new Error("Automation credential and configured revision authority do not match the signed policy.");
  for(const candidate of queue){const revisionId=candidate.row.revision.event.id,cityId=candidate.row.revision.city.cityId;try{
   store.plan(policyEvent,policy,revisionId,cityId);const audit=store.get(revisionId);let event=audit?.signedEvent;
   if(!event){const fresh=(await candidates()).find(item=>item.row.revision.event.id===revisionId);if(!fresh)throw new Error("Candidate authority or content changed before signing.");event=finalizeEvent(fresh.template,secret);store.approve(revisionId,event);}
   await publishVerifiedEvent(event,relayConfig.writeRelays,relayConfig.writeRelays.length,auth=>Promise.resolve(signTransportAuth(auth,secret,relayConfig.writeRelays)));
   const readback=(await queryRelayEvents(relayConfig.readRelays,[30304],undefined,{ids:[event.id]})).map(parseApprovalRecord).find(record=>record?.event.id===event!.id);
   if(!readback||readback.approval.note!==AUTOMATED_CITY_REVISION_NOTE)throw new Error("Exact automated approval read-back failed.");
   const snapshot=await queryDirectoryRecords(relayConfig.readRelays),live=managedCities(snapshot.revisions,snapshot.approvals).find(row=>row.revision.event.id===revisionId&&row.decision.event.id===event!.id&&row.state==="approved");if(!live)throw new Error("Automated revision is not the current public city after read-back.");
   store.record(revisionId,"published","exact relay read-back",event.id);console.log(JSON.stringify({revisionId,cityId,state:"published",eventId:event.id}));
  }catch(error){const reason=error instanceof Error?error.message:"verification failed",audit=store.get(revisionId);if(audit?.state==="planned")store.record(revisionId,"blocked",reason.replace(/[^\x20-\x7e]/g," ").slice(0,200));console.error(JSON.stringify({revisionId,cityId,state:"blocked",reason}));}}
 }finally{secret.fill(0);db.close();}
}
main().finally(closeRelayReadPool).catch(error=>{console.error(error instanceof Error?error.message:"City revision automation failed.");process.exitCode=1;});
