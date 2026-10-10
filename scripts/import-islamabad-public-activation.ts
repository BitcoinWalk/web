/** One-city staging acceptance cutover. It exposes no production city page,
 * performs no payment and grants no authority to provision other cities. */
import {execFileSync} from "node:child_process";
import {lstatSync,readFileSync} from "node:fs";
import {DatabaseSync,backup} from "node:sqlite";
import {userInfo} from "node:os";
import {RustressActivator} from "../src/rustress/client";
import {managedProvisionConfigSchema,provisionDigest} from "../src/rustress/contract";
import {verifyCityActivation} from "../src/rustress/activation-contract";
import {canonicalLoopbackTransport,loopbackApiTransport} from "../src/rustress/loopback-http";
import {verifyCityPublicProvisioning} from "../src/rustress/public-provisioning";
import {readCityBrand} from "../src/nostr/city-brand";

const city="5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd",request="ec1104ca-78df-48ac-947d-11f00b76e9da",
  pubkey="81311f94b68d6b2cc0e43fee4a853d53b4ba5c4071f236833a9cb92dcaf3824b",
  binding="b377a42fbb4c597c0c3af9f49cd5b8b0301184a79d5a88255555bd5056518f19";
type Row={city:string;request:string;reserved_config:string;activation_config:string;proof:string;public_origin:string;phase:string;nip05:string;lnurl:string;lease:string|null;until:number;updated_at:number};
async function main(){
  if(userInfo().username!=="bitcoinwalk"||process.getuid?.()===0)throw new Error("Non-root bitcoinwalk user required.");
  const apply=process.argv[2]==="--apply";
  if(!["--apply","--verify-only"].includes(process.argv[2]))throw new Error("Explicit verify-only or apply required.");
  const sourcePath="/var/lib/bitcoinwalk-app-staging/payments.sqlite",targetPath="/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite";
  for(const path of [sourcePath,targetPath]){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink())throw new Error("Regular database files required.");}
  const source=new DatabaseSync(sourcePath,{readOnly:true}),target=new DatabaseSync(targetPath,{readOnly:!apply});
  try{
    const load=()=>source.prepare("SELECT * FROM rustress_activation_task WHERE city=?").get(city) as Row|undefined;
    const row=load();
    if(!row||row.request!==request||!["verifying","needs-attention","active"].includes(row.phase)||row.lease!==null||row.until!==0||
      Date.now()-row.updated_at>300_000||row.updated_at>Date.now()+5000||row.public_origin!=="https://bitcoinwalk.org"||!/^[0-9a-f]{64}$/.test(row.proof))
      throw new Error("Fresh, completed provider read-back is required.");
    const reserved=managedProvisionConfigSchema.parse(JSON.parse(row.reserved_config)),active=verifyCityActivation(reserved,JSON.parse(row.activation_config));
    if(active.cityId!==city||active.localPart!=="islamabad"||active.brandPubkey!==pubkey||active.brandEventId!==binding||active.payoutVersion!==3||active.walletRef!=="bitcoinwalk-rustress")
      throw new Error("Exact reviewed Islamabad configuration required.");
    const signed=source.prepare("SELECT status,approved_event FROM city_brand_request WHERE id=? AND city_id=?").get(request,city) as {status:string;approved_event:string}|undefined;
    if(signed?.status!=="active")throw new Error("City identity is not active.");
    const event=JSON.parse(signed.approved_event),brand=readCityBrand(event);
    if(event.id!==binding||brand.cityId!==city||brand.brandPubkey!==pubkey||brand.action!=="activate")throw new Error("Signed city identity mismatch.");
    const pid=execFileSync("systemctl",["--user","show","bitcoinwalk-app-staging.service","-p","MainPID","--value"],{encoding:"utf8"}).trim();
    const env=Object.fromEntries(readFileSync(`/proc/${pid}/environ`,"utf8").split("\0").filter(Boolean).map(item=>{const i=item.indexOf("=");return [item.slice(0,i),item.slice(i+1)];}));
    const tokenPath=env.BITCOINWALK_RUSTRESS_MANAGED_TOKEN_FILE,stat=lstatSync(tokenPath);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.mode&0o077)throw new Error("Private provider credential required.");
    const origin=env.BITCOINWALK_RUSTRESS_MANAGED_ORIGIN;
    if(origin!=="http://127.0.0.1:18895")throw new Error("Exact reviewed provider tunnel required.");
    const provider=new RustressActivator({origin,domain:"bitcoinwalk.org",token:readFileSync(tokenPath,"utf8").trim(),adapterRevision:"68fdd3cfd2c034678d8907db9c4f855d209fee4f24099b8c96842608b062decb"},loopbackApiTransport(origin,"bitcoinwalk.org"));
    const receipt=await provider.status(active);
    if(receipt.state!=="applied"||receipt.configHash!==provisionDigest(active))throw new Error("Provider activation not applied.");
    await verifyCityPublicProvisioning({publicOrigin:"https://bitcoinwalk.org",domain:"bitcoinwalk.org",localPart:"islamabad",brandPubkey:pubkey},canonicalLoopbackTransport(origin,"bitcoinwalk.org"));
    const fresh=load();if(!fresh||fresh.proof!==row.proof||fresh.activation_config!==row.activation_config||!["verifying","needs-attention","active"].includes(fresh.phase))throw new Error("Source activation changed.");
    const collision=target.prepare("SELECT * FROM rustress_activation_task WHERE city=? OR json_extract(activation_config,'$.localPart')='islamabad'").all(city) as Row[];
    if(collision.length){if(collision.length!==1||collision[0].city!==city||collision[0].activation_config!==row.activation_config||collision[0].proof!==row.proof)throw new Error("Existing public route differs.");console.log("ISLAMABAD_PUBLIC_PROJECTION already_present=yes");return;}
    if(!apply){console.log("ISLAMABAD_PUBLIC_PROJECTION_VERIFY_OK payment_created=no");return;}
    const evidence=`/home/bitcoinwalk/backups/islamabad-public-projection-${Date.now()}.sqlite`;
    await backup(target,evidence);
    target.exec("BEGIN IMMEDIATE");
    try{
      // Retain the true pending public-verification state. The staging worker
      // must subsequently verify the actual canonical HTTPS endpoints.
      target.prepare("INSERT INTO rustress_activation_task(city,request,reserved_config,activation_config,proof,public_origin,phase,nip05,lnurl,lease,until,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(row.city,row.request,row.reserved_config,row.activation_config,row.proof,row.public_origin,row.phase,row.nip05,row.lnurl,null,0,row.updated_at);
      target.exec("COMMIT");
    }catch(error){target.exec("ROLLBACK");throw error;}
    console.log(`ISLAMABAD_PUBLIC_PROJECTION_IMPORTED payment_created=no evidence=${evidence}`);
  }finally{source.close();target.close();}
}
process.umask(0o077);
main().catch(()=>{console.error("Islamabad public projection refused. No provider details or payout destination logged.");process.exitCode=1;});
