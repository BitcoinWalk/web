import {lstatSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {finalizeEvent,getPublicKey,type Event} from "nostr-tools";
import {relayConfig} from "../src/lib/relay-config";
import {SUPER_ADMIN_PUBKEY} from "../src/nostr/authority";
import {createApprovalEvent,createAutomatedNewCityAuthorizationEvent} from "../src/nostr/city-event";
import {parseApprovalRecord,parseAuthorizationRecord,parseCityRevision,queryRelayEvents,closeRelayReadPool} from "../src/nostr/city-records";
import {AUTOMATED_NEW_CITY_NOTE} from "../src/nostr/new-city-automation-contract";
import {readNewCityAutomationPolicy} from "../src/nostr/new-city-automation-policy";
import {publishVerifiedEvent} from "../src/nostr/relay";
import {signTransportAuth} from "../src/guide/core";

function protectedFile(path:string,maximum:number){const stat=lstatSync(path);if(!stat.isFile()||stat.mode&0o077||stat.size>maximum)throw new Error("Protected automation credential required.");return readFileSync(path,"utf8").trim();}
async function main(){
 process.umask(0o077);if(process.argv[2]!=="--run")throw new Error("Use --run through the isolated staging pilot.");
 const credentials=process.env.CREDENTIALS_DIRECTORY;if(!credentials)throw new Error("Run through the isolated staging pilot.");
 const policyEvent=JSON.parse(protectedFile(join(credentials,"policy.json"),32_768)) as Event,policy=readNewCityAutomationPolicy(policyEvent),raw=protectedFile(join(credentials,"signer-key"),66),secret=Uint8Array.from(Buffer.from(raw,"hex"));
 try{
  if(getPublicKey(secret)!==policy.automationPubkey||policy.automationPubkey===SUPER_ADMIN_PUBKEY||process.env.NEXT_PUBLIC_NEW_CITY_AUTOMATION_PUBKEY!==policy.automationPubkey)throw new Error("Automation credential and configured new-city authority do not match the signed policy.");
  const revisions=(await queryRelayEvents(relayConfig.readRelays,[30303],undefined,{ids:[policy.revisionId]})).map(parseCityRevision).filter(Boolean),revision=revisions[0];
  if(!revision||revision.event.pubkey!==policy.organizerPubkey||revision.city.cityId!==policy.cityId||revision.city.requestedTier!=="free")throw new Error("The exact Basic city submission is unavailable or changed.");
  const referenced=revision.event.tags.filter(tag=>tag[0]==="e"&&tag[3]==="initial-walk").map(tag=>tag[1]);if(JSON.stringify(referenced)!==JSON.stringify(policy.initialEventIds))throw new Error("The exact submitted first-walk series changed.");
  const grant=finalizeEvent({...createAutomatedNewCityAuthorizationEvent({cityId:policy.cityId,creatorPubkey:policy.organizerPubkey,creatorRevisionId:policy.revisionId,editorPubkeys:[policy.organizerPubkey],superAdminPubkey:SUPER_ADMIN_PUBKEY}),created_at:policy.issuedAt+1},secret);
  const approval=finalizeEvent({...createApprovalEvent({cityId:policy.cityId,cityRevisionId:policy.revisionId,initialEventIds:policy.initialEventIds,status:"approved",note:AUTOMATED_NEW_CITY_NOTE}),created_at:policy.issuedAt+2},secret);
  for(const event of [grant,approval])await publishVerifiedEvent(event,relayConfig.writeRelays,relayConfig.writeRelays.length,auth=>Promise.resolve(signTransportAuth(auth,secret,relayConfig.writeRelays)));
  const [grants,decisions]=await Promise.all([queryRelayEvents(relayConfig.readRelays,[30302],undefined,{ids:[grant.id]}),queryRelayEvents(relayConfig.readRelays,[30304],undefined,{ids:[approval.id]})]);
  if(!grants.some(event=>parseAuthorizationRecord(event)?.event.id===grant.id)||!decisions.some(event=>parseApprovalRecord(event)?.event.id===approval.id))throw new Error("Exact grant or approval read-back failed.");
  console.log(JSON.stringify({result:"NEW_CITY_PUBLISHED",cityId:policy.cityId,revisionId:policy.revisionId,grantId:grant.id,approvalId:approval.id,initialEventIds:policy.initialEventIds}));
 }finally{secret.fill(0);}
}
main().finally(closeRelayReadPool).catch(error=>{console.error(error instanceof Error?error.message:"New city automation failed.");process.exitCode=1;});
