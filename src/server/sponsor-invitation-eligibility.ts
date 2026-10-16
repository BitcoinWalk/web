import type {DatabaseSync} from "node:sqlite";
import {directoryConfig} from "../lib/directory-config";
import {serverReadRelays} from "../lib/server-relay-config";
import {queryDirectoryRecords} from "../nostr/city-records";
import {managedCities} from "../nostr/moderation";
import {verifyNip05} from "../nostr/profiles";

export type EligibleSponsorHostCity={id:string;name:string;slug:string;payoutVersion:number};
type SetupRow={currentOwnerPubkey:string;payoutVersion:number|null;brandPubkey:string|null};
type DestinationRow={owner_pubkey:string};
type PaidSetupRow={cityId:string;cityName:string;payoutVersion:number;brandPubkey:string|null};
function table(db:DatabaseSync,name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
function payoutAuthority(db:DatabaseSync,cityId:string,owner:string){
 if(!table(db,"pro_setup_task")||!table(db,"payout_destination_version"))return null;
 const setup=db.prepare("SELECT currentOwnerPubkey,payoutVersion,brandPubkey FROM pro_setup_task WHERE cityId=?").get(cityId) as SetupRow|undefined;
 if(!setup?.payoutVersion||setup.currentOwnerPubkey!==owner)return null;
 const destination=db.prepare("SELECT owner_pubkey FROM payout_destination_version WHERE city_id=? AND version=?").get(cityId,setup.payoutVersion) as DestinationRow|undefined;
 return destination?.owner_pubkey===owner?setup:null;
}
function paidSetups(db:DatabaseSync,owner:string):PaidSetupRow[]{
 if(!["payment_invoice","paid_city_entitlement","pro_setup_task","payout_destination_version"].every(name=>table(db,name)))return [];
 return db.prepare(`SELECT task.cityId,invoice.cityName,task.payoutVersion,task.brandPubkey
  FROM pro_setup_task task
  JOIN paid_city_entitlement entitlement ON entitlement.cityId=task.cityId AND entitlement.invoiceId=task.entitlementId
  JOIN payment_invoice invoice ON invoice.id=entitlement.invoiceId AND invoice.cityId=task.cityId AND invoice.status='paid'
  JOIN payout_destination_version destination ON destination.city_id=task.cityId AND destination.version=task.payoutVersion AND destination.owner_pubkey=task.currentOwnerPubkey
  WHERE task.currentOwnerPubkey=? AND task.payoutVersion IS NOT NULL
  ORDER BY task.cityId`).all(owner) as PaidSetupRow[];
}
const comparable=(value:string)=>value.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim();
function configuredProfile(cityId:string,cityName:string){
 const exact=directoryConfig.paidCities[cityId];if(exact)return exact;
 const matches=Object.values(directoryConfig.paidCities).filter(city=>city.cityName&&comparable(city.cityName)===comparable(cityName));
 return matches.length===1?matches[0]:undefined;
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
export const sponsorEligibilityDependencies={directory:()=>queryDirectoryRecords(serverReadRelays()),verifyNip05,verifyLightning:verifyPublicLightning,publicOrigin};

/** Fresh server and public read-back evidence used both when issuing and when
 * accepting a private sponsor link. Provider-local queues are deliberately not
 * treated as authority: entitlement, owner, payout version, NIP-05 and LNURL
 * must all agree in the environment serving the request. */
export async function eligibleSponsorHostCities(db:DatabaseSync,actor:string,deps=sponsorEligibilityDependencies):Promise<EligibleSponsorHostCity[]>{
 const directory=await deps.directory(),origin=deps.publicOrigin(),approved=new Map(managedCities(directory.revisions,directory.approvals).filter(row=>row.state==="approved").map(row=>[row.revision.city.cityId,{name:row.revision.city.cityName,slug:row.decision.approval.slug??row.revision.city.slug}]));
 const candidates=paidSetups(db,actor).flatMap(row=>{
  const current=approved.get(row.cityId),configured=configuredProfile(row.cityId,row.cityName),profile=current??(configured?{name:configured.cityName??row.cityName,slug:configured.slug}:undefined);
  const setup=payoutAuthority(db,row.cityId,actor);return profile&&setup?[{row,profile,setup}]:[];
 });
 const checked=await Promise.all(candidates.map(async candidate=>{const identity=candidate.setup.brandPubkey??actor,identifier=`${candidate.profile.slug}@${origin.hostname}`,[nip05,lightning]=await Promise.allSettled([deps.verifyNip05(identity,identifier),deps.verifyLightning(origin,candidate.profile.slug)]);return nip05.status==="fulfilled"&&nip05.value&&lightning.status==="fulfilled"&&lightning.value?{id:candidate.row.cityId,name:candidate.profile.name,slug:candidate.profile.slug,payoutVersion:candidate.setup.payoutVersion!}:null;}));
 return checked.filter((row):row is EligibleSponsorHostCity=>row!==null);
}
