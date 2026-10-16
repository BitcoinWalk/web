import {lstatSync} from "node:fs";
import {userInfo} from "node:os";
import {backup,DatabaseSync} from "node:sqlite";
import {installMadeiraLegacyProEntitlement,verifyMadeiraLegacyProEntitlement} from "../src/payments/legacy-pro-entitlement";
import {MADEIRA_PILOT} from "../src/nostr/madeira-pilot";

const path=process.argv[2],mode=process.argv[3],sourcePath=process.argv[4];
const stagingPath="/var/lib/bitcoinwalk-app-staging/payments.sqlite",productionPath="/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite";
const registrationColumns="city_id,revision_id,version,owner_pubkey,normalized,endpoint,callback,min_sendable,max_sendable,owner_event_id,owner_event,confirmed_at";
type RegistrationRow={city_id:string;revision_id:string;version:number;owner_pubkey:string;normalized:string;endpoint:string;callback:string;min_sendable:number;max_sendable:number;owner_event_id:string;owner_event:string;confirmed_at:number};
async function main(){
  if(userInfo().username!=="bitcoinwalk"||process.getuid?.()===0)throw new Error("Run as the non-root bitcoinwalk user.");
  if(![stagingPath,productionPath].includes(path)||!["--verify-only","--apply","--import-and-apply"].includes(mode)||
    mode==="--import-and-apply"&&(path!==productionPath||sourcePath!==stagingPath))
    throw new Error("Use an exact BitcoinWalk payments database path with --verify-only, --apply, or the exact production/staging pair with --import-and-apply.");
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Payments database must be an exact regular file.");
  if(mode==="--import-and-apply"){
    const sourceStat=lstatSync(sourcePath);if(!sourceStat.isFile()||sourceStat.isSymbolicLink())throw new Error("Registration source must be the exact staging database file.");
    const source=new DatabaseSync(sourcePath,{readOnly:true}),target=new DatabaseSync(path);
    try{
      const sourceEvidence=verifyMadeiraLegacyProEntitlement(source),registration=source.prepare(`SELECT ${registrationColumns} FROM registration_payout_version WHERE city_id=? AND version=?`).get(MADEIRA_PILOT.cityId,sourceEvidence.registrationVersion) as RegistrationRow|undefined;
      if(!registration)throw new Error("Verified staging payout registration is unavailable.");
      const collisions=target.prepare(`SELECT ${registrationColumns} FROM registration_payout_version WHERE city_id=? OR owner_event_id=?`).all(MADEIRA_PILOT.cityId,registration.owner_event_id) as RegistrationRow[];
      if(collisions.length&&(collisions.length!==1||JSON.stringify(collisions[0])!==JSON.stringify(registration)))throw new Error("Existing production payout registration differs; no record changed.");
      const evidence=`/home/bitcoinwalk/backups/madeira-legacy-pro-entitlement-${Date.now()}.sqlite`;await backup(target,evidence);
      target.exec("BEGIN IMMEDIATE");
      try{
        if(!collisions.length)target.prepare(`INSERT INTO registration_payout_version(${registrationColumns}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(registration));
        const result=installMadeiraLegacyProEntitlement(target);target.exec("COMMIT");
        console.log(`MADEIRA_LEGACY_PRO_IMPORT_OK registrationCreated=${!collisions.length} entitlementCreated=${result.created} backup=${evidence} evidence=${result.entitlement.evidenceHash}`);
      }catch(error){target.exec("ROLLBACK");throw error;}
    }finally{source.close();target.close();}
    return;
  }
  const db=new DatabaseSync(path,{readOnly:mode==="--verify-only"});
  try{
    if(mode==="--verify-only"){
      const result=verifyMadeiraLegacyProEntitlement(db);console.log(`MADEIRA_LEGACY_PRO_VERIFY_OK evidence=${result.evidenceHash}`);
      return;
    }
    const evidence=`/home/bitcoinwalk/backups/madeira-legacy-pro-entitlement-${Date.now()}.sqlite`;await backup(db,evidence);
    db.exec("BEGIN IMMEDIATE");
    try{const result=installMadeiraLegacyProEntitlement(db);db.exec("COMMIT");console.log(`MADEIRA_LEGACY_PRO_INSTALL_OK created=${result.created} backup=${evidence} evidence=${result.entitlement.evidenceHash}`);}
    catch(error){db.exec("ROLLBACK");throw error;}
  }finally{db.close();}
}
process.umask(0o077);
main().catch(error=>{
  const reason=error instanceof Error?error.message:"Unknown verification failure.";
  console.error(`Madeira legacy Pro entitlement installation refused: ${reason} No private payout details logged.`);
  process.exitCode=1;
});
