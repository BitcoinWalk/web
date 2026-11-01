import {lstatSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {finalizeEvent,getPublicKey,type Event} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../src/nostr/authority";
import {readCityBrandAutomationPolicy} from "../src/nostr/city-brand-automation";
import {relayConfig} from "../src/lib/relay-config";
import {publishVerifiedEvent} from "../src/nostr/relay";
import {signTransportAuth} from "../src/guide/core";
import {approveBrandRequestAutomated,confirmBrandPublication,listBrandRequests,prepareBrandPublication,recordAutomatedBrandPublication,reviewBrandRequest} from "../src/server/pro-setup";

function protectedFile(path:string,maximum:number){
 const stat=lstatSync(path);if(!stat.isFile()||stat.mode&0o077||stat.size>maximum)throw new Error("Protected automation credential required.");
 return readFileSync(path,"utf8").trim();
}

async function main(){
 process.umask(0o077);
 const mode=process.argv[2];if(mode!=="--dry-run"&&mode!=="--run")throw new Error("Use --dry-run or --run.");
 const credentials=process.env.CREDENTIALS_DIRECTORY,environment=process.env.BITCOINWALK_CITY_BRAND_AUTOMATION_ENVIRONMENT;
 if(!credentials||(environment!=="staging"&&environment!=="production"))throw new Error("Run through the isolated city identity automation service.");
 const policyEvent=JSON.parse(protectedFile(join(credentials,"policy.json"),16_384)) as Event,policy=readCityBrandAutomationPolicy(policyEvent,environment);
 const queue=(await listBrandRequests(SUPER_ADMIN_PUBKEY)).filter(row=>row.state==="approved"||row.state==="pending"&&row.proofsReady);
 console.log(JSON.stringify({mode:mode.slice(2),environment,policyId:policyEvent.id,maximumCities:policy.maximumCities,candidates:queue.map(row=>({requestId:row.requestId,cityId:row.cityId,state:row.state}))}));
 if(mode==="--dry-run")return;
 if(!relayConfig.writeRelays.length)throw new Error("No city identity publication relay is configured.");
 const raw=protectedFile(join(credentials,"signer-key"),66);if(!/^[0-9a-f]{64}$/.test(raw))throw new Error("Invalid automation credential.");
 const secret=Uint8Array.from(Buffer.from(raw,"hex"));
 try{
  if(getPublicKey(secret)!==policy.automationPubkey||policy.automationPubkey===SUPER_ADMIN_PUBKEY)throw new Error("Automation credential does not match the approved dedicated identity.");
  for(const row of queue){
   try{
    let event:Event;
    if(row.state==="approved")event=(await prepareBrandPublication(row.requestId,SUPER_ADMIN_PUBKEY)).event;
    else{
     const template=await reviewBrandRequest(row.requestId,SUPER_ADMIN_PUBKEY);event=finalizeEvent(template,secret);
     await approveBrandRequestAutomated(row.requestId,policyEvent,event);
    }
    await publishVerifiedEvent(event,relayConfig.writeRelays,relayConfig.writeRelays.length,auth=>Promise.resolve(signTransportAuth(auth,secret,relayConfig.writeRelays)));
    const confirmed=await confirmBrandPublication(row.requestId,SUPER_ADMIN_PUBKEY);
    recordAutomatedBrandPublication(row.requestId,confirmed.eventId);
    console.log(JSON.stringify({requestId:row.requestId,cityId:row.cityId,state:"published",eventId:confirmed.eventId,relays:confirmed.relays}));
   }catch(error){console.error(JSON.stringify({requestId:row.requestId,cityId:row.cityId,state:"blocked",reason:error instanceof Error?error.message:"verification failed"}));}
  }
 }finally{secret.fill(0);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"City identity automation failed.");process.exitCode=1;});
