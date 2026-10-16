import type {DatabaseSync} from "node:sqlite";
import {cityOwnerPubkey} from "../domain/city";
import {serverReadRelays} from "../lib/server-relay-config";
import {queryAuthorizations,queryDirectoryRecords} from "../nostr/city-records";
import {latestDashboardGrants} from "../nostr/dashboard-data";
import {managedCities} from "../nostr/moderation";
import {cityProvisioningCapabilities} from "../rustress/provisioning-capabilities";

export type EligibleSponsorHostCity={id:string;name:string;slug:string;payoutVersion:number};
function table(db:DatabaseSync,name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
function entitled(db:DatabaseSync,cityId:string){return table(db,"paid_city_entitlement")&&!!db.prepare("SELECT cityId FROM paid_city_entitlement WHERE cityId=?").get(cityId);}
function activePayoutVersion(db:DatabaseSync,cityId:string):number|null{
 if(!table(db,"rustress_activation_task"))return null;
 const activation=db.prepare("SELECT phase,json_extract(activation_config,'$.payoutVersion') payoutVersion FROM rustress_activation_task WHERE city=?").get(cityId) as {phase:string;payoutVersion:number|null}|undefined;if(activation?.phase!=="active"||!activation.payoutVersion)return null;
 if(!table(db,"rustress_payout_update_task"))return activation.payoutVersion;
 const update=db.prepare("SELECT payout_version payoutVersion,phase FROM rustress_payout_update_task WHERE city=? ORDER BY payout_version DESC LIMIT 1").get(cityId) as {payoutVersion:number;phase:string}|undefined;
 return update?.phase==="active"&&update.payoutVersion>activation.payoutVersion?update.payoutVersion:activation.payoutVersion;
}

/** Fresh server evidence used both when issuing and when accepting a private
 * sponsor link. No invitation record can keep authority after ownership or
 * public payout capability changes. */
export async function eligibleSponsorHostCities(db:DatabaseSync,actor:string):Promise<EligibleSponsorHostCity[]>{
 const [directory,authorizations]=await Promise.all([queryDirectoryRecords(serverReadRelays()),queryAuthorizations(serverReadRelays())]),grants=new Map(latestDashboardGrants(authorizations).map(row=>[row.grant.cityId,row.grant]));
 return managedCities(directory.revisions,directory.approvals).filter(row=>row.state==="approved").flatMap(row=>{
  const city=row.revision.city,grant=grants.get(city.cityId);if(!grant||cityOwnerPubkey(grant)!==actor||!entitled(db,city.cityId))return [];
  const setup=table(db,"pro_setup_task")?db.prepare("SELECT payoutVersion FROM pro_setup_task WHERE cityId=?").get(city.cityId) as {payoutVersion:number|null}|undefined:undefined,activeVersion=activePayoutVersion(db,city.cityId),capabilities=cityProvisioningCapabilities(db,city.cityId);
  return setup?.payoutVersion&&setup.payoutVersion===activeVersion&&capabilities.overall==="active"&&capabilities.nip05==="active"&&capabilities.lightning==="active"?[{id:city.cityId,name:city.cityName,slug:row.decision.approval.slug??city.slug,payoutVersion:setup.payoutVersion}]:[];
 });
}
