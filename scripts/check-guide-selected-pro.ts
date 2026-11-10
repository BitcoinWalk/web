import assert from "node:assert/strict";
import {readFileSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {getPublicKey,nip19} from "nostr-tools";
import {configSchema} from "../src/guide/core";
import {readGuideSupportPlan} from "../src/guide/support-access";
import {GUIDE_PERSISTENT_PRO_RECIPIENT} from "../src/guide/persistent-pro";

async function main(){
 assert(process.argv.length===2||process.argv.length===3);
 let recipient=GUIDE_PERSISTENT_PRO_RECIPIENT;
 if(process.argv[2]){const decoded=nip19.decode(process.argv[2]);assert.equal(decoded.type,"npub");assert(typeof decoded.data==="string"&&/^[0-9a-f]{64}$/.test(decoded.data));recipient=decoded.data;}
 const config=configSchema.parse(JSON.parse(readFileSync(process.env.GUIDE_CONFIG!,"utf8")));
 assert.equal(config.proSetupStatusURL,"http://127.0.0.1:3345/api/pro-setup-notifications");assert(config.support.enabled);
 const path=join(process.env.CREDENTIALS_DIRECTORY!,"guide-key"),stat=lstatSync(path);
 assert(stat.isFile()&&(stat.mode&0o027)===0&&stat.size<=66);
 const raw=readFileSync(path,"utf8").trim();assert(/^[0-9a-f]{64}$/.test(raw));
 const secret=Uint8Array.from(Buffer.from(raw,"hex"));
 try{
  assert.equal(getPublicKey(secret),"9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c");
  const plan=await readGuideSupportPlan(secret,config.proSetupStatusURL,recipient);
  console.log(JSON.stringify({result:"GUIDE_PRO_ENTITLEMENT_CHECK",recipient,plan,proVerified:plan==="pro",sent:false,modelCalls:0,productionStateChanged:false}));
 }finally{secret.fill(0);}
}
main().catch(()=>{console.error("Selected Pro entitlement could not be verified; no private data logged.");process.exitCode=1;});
