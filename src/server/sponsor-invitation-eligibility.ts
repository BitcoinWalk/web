import type {DatabaseSync} from "node:sqlite";
import {cityOwnerPubkey} from "../domain/city";
import {serverReadRelays} from "../lib/server-relay-config";
import {queryAuthorizations,queryDirectoryRecords} from "../nostr/city-records";
import {latestDashboardGrants} from "../nostr/dashboard-data";
import {managedCities} from "../nostr/moderation";
import {verifyNip05} from "../nostr/profiles";

export type EligibleSponsorHostCity={id:string;name:string;slug:string;payoutVersion:number};
type SetupRow={currentOwnerPubkey:string;payoutVersion:number|null;brandPubkey:string|null};
type DestinationRow={owner_pubkey:string};
function table(db:DatabaseSync,name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
function entitled(db:DatabaseSync,cityId:string){return table(db,"paid_city_entitlement")&&!!db.prepare("SELECT cityId FROM paid_city_entitlement WHERE cityId=?").get(cityId);}
function payoutAuthority(db:DatabaseSync,cityId:string,owner:string){
 if(!table(db,"pro_setup_task")||!table(db,"payout_destination_version"))return null;
 const setup=db.prepare("SELECT currentOwnerPubkey,payoutVersion,brandPubkey FROM pro_setup_task WHERE cityId=?").get(cityId) as SetupRow|undefined;
 if(!setup?.payoutVersion||setup.currentOwnerPubkey!==owner)return null;
 const destination=db.prepare("SELECT owner_pubkey FROM payout_destination_version WHERE city_id=? AND version=?").get(cityId,setup.payoutVersion) as DestinationRow|undefined;
 return destination?.owner_pubkey===owner?setup:null;
}
function publicOrigin(){const value=process.env.BITCOINWALK_PUBLIC_ORIGIN?.trim()||"https://bitcoinwalk.org",url=new URL(value);if(url.protocol!=="https:"||url.origin!==value||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error("Invalid canonical public origin.");return url;}
async function verifyPublicLightning(origin:URL,slug:string){
 const endpoint=new URL(`/.well-known/lnurlp/${encodeURIComponent(slug)}`,origin),response=await fetch(endpoint,{headers:{Accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!response.ok||!(response.headers.get("content-type")??"").toLowerCase().includes("json"))return false;
 let body:Record<string,unknown>;try{body=await response.json() as Record<string,unknown>;}catch{return false;}
 let callback:URL;try{callback=new URL(String(body.callback??""));}catch{return false;}
 const min=Number(body.minSendable),max=Number(body.maxSendable);
 return body.tag==="payRequest"&&body.allowsNostr===true&&callback.origin===origin.origin&&callback.pathname===`/lnurlp/${encodeURIComponent(slug)}/callback`&&Number.isSafeInteger(min)&&Number.isSafeInteger(max)&&min>=1000&&max>=min;
}
export const sponsorEligibilityDependencies={directory:()=>queryDirectoryRecords(serverReadRelays()),authorizations:()=>queryAuthorizations(serverReadRelays()),verifyNip05,verifyLightning:verifyPublicLightning,publicOrigin};

/** Fresh server and public read-back evidence used both when issuing and when
 * accepting a private sponsor link. Provider-local queues are deliberately not
 * treated as authority: entitlement, owner, payout version, NIP-05 and LNURL
 * must all agree in the environment serving the request. */
export async function eligibleSponsorHostCities(db:DatabaseSync,actor:string,deps=sponsorEligibilityDependencies):Promise<EligibleSponsorHostCity[]>{
 const [directory,authorizations]=await Promise.all([deps.directory(),deps.authorizations()]),grants=new Map(latestDashboardGrants(authorizations).map(row=>[row.grant.cityId,row.grant])),origin=deps.publicOrigin();
 const candidates=managedCities(directory.revisions,directory.approvals).filter(row=>row.state==="approved").flatMap(row=>{
  const city=row.revision.city,grant=grants.get(city.cityId);if(!grant||cityOwnerPubkey(grant)!==actor||!entitled(db,city.cityId))return [];
  const setup=payoutAuthority(db,city.cityId,actor);return setup?[{city,setup,slug:row.decision.approval.slug??city.slug}]:[];
 });
 const checked=await Promise.all(candidates.map(async candidate=>{const identity=candidate.setup.brandPubkey??actor,identifier=`${candidate.slug}@${origin.hostname}`,[nip05,lightning]=await Promise.allSettled([deps.verifyNip05(identity,identifier),deps.verifyLightning(origin,candidate.slug)]);return nip05.status==="fulfilled"&&nip05.value&&lightning.status==="fulfilled"&&lightning.value?{id:candidate.city.cityId,name:candidate.city.cityName,slug:candidate.slug,payoutVersion:candidate.setup.payoutVersion!}:null;}));
 return checked.filter((row):row is EligibleSponsorHostCity=>row!==null);
}
