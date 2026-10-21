import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {resolveCityBrand, type CityBrandChallenge} from "../nostr/city-brand";
import {queryRelayEvents} from "../nostr/city-records";
import {managedCities} from "../nostr/moderation";
import {parsePublicProfile, profileRelays, verifyNip05, type PublicProfile} from "../nostr/profiles";
import {serverReadRelays} from "../lib/server-relay-config";
import {configuredPaidCity,configuredPaidCityEntry,directoryConfig} from "../lib/directory-config";
import {getPaymentRuntime} from "../payments/runtime";
import type {ProSetupTask} from "../payments/pro-setup-task-store";
import {cityProvisioningCapabilities, type CityProvisioningCapabilities} from "../rustress/provisioning-capabilities";
import {citySetupEvidence} from "./city-setup-evidence";
import {activeNamedIdentity} from "../rustress/public-identity-store";

export type IdentityHealthCheckState="pass"|"fail"|"unknown"|"future"|"not-applicable";
export type IdentityHealthStatus="complete"|"action-required"|"not-configured"|"unknown"|"not-applicable";
export type CityIdentityHealthCheck={key:"identity"|"profile"|"nip05"|"lightning"|"binding"|"recovery"|"publishing";label:string;state:IdentityHealthCheckState;detail:string};
export type CityIdentityHealth={cityId:string;cityName:string;slug:string;availableInEnvironment:boolean;tier:"basic"|"pro"|"pilot";status:IdentityHealthStatus;activationState?:"pending"|"approved"|"active"|"expired";checks:CityIdentityHealthCheck[];checkedAt:number;lastVerifiedAt?:number};

type ActiveBrand={eventId:string;verifiedAt:number;challenge:CityBrandChallenge};
type ProfileEvidence={reachable:number;matching:number;nip05:number;lightning:number};
export type CityIdentityHealthEvidence={
  cityId:string;cityName:string;slug:string;availableInEnvironment:boolean;tier:"basic"|"pro"|"pilot";checkedAt:number;task:ProSetupTask|null;active:ActiveBrand|null;
  activationState?:"pending"|"approved"|"active"|"expired";preparedBrandPubkey?:string;binding:"pass"|"fail"|"unknown";profile:ProfileEvidence;capabilities:CityProvisioningCapabilities;nip05Verified:boolean;activationUpdatedAt?:number;
};

export function classifyCityIdentityTier(input:{operatorConfirmed:boolean;settled:boolean;hasSetup:boolean;hasActiveBinding:boolean;staging:boolean}):CityIdentityHealth["tier"]{
  if(input.operatorConfirmed||input.settled&&!input.staging)return "pro";
  if(input.settled||input.hasSetup||input.hasActiveBinding)return "pilot";
  return "basic";
}

/** A reviewed legacy Pro service can predate the canonical production city
 * record. Keep health reads attached to that durable provisioning record while
 * every public/admin action continues to use the current city ID. */
export function provisioningStatusCityId(cityId:string,slugs:string[]):string{
  if(directoryConfig.paidCities[cityId])return cityId;
  const configured=configuredPaidCity(cityId,slugs);
  return Object.entries(directoryConfig.paidCities).find(([,value])=>value===configured)?.[0]??cityId;
}

const check=(key:CityIdentityHealthCheck["key"],label:string,state:IdentityHealthCheckState,detail:string):CityIdentityHealthCheck=>({key,label,state,detail});
export function summarizeCityIdentityHealth(input:CityIdentityHealthEvidence):CityIdentityHealth{
  if(input.tier==="basic")return {cityId:input.cityId,cityName:input.cityName,slug:input.slug,availableInEnvironment:input.availableInEnvironment,tier:"basic",status:"not-applicable",checkedAt:input.checkedAt,checks:[
    check("identity","Dedicated city npub","not-applicable","Basic cities continue to use the organizer identity; a separate Pro city identity is not required."),
    check("publishing","City-signed publication","not-applicable","Basic walks continue to use the organizer's existing publishing flow."),
  ]};
  const task=input.task,active=input.active,preparedBrand=input.preparedBrandPubkey,identifier=`${input.slug}@bitcoinwalk.org`;
  const expectedBrand=active?.challenge.binding.brandPubkey??(input.activationState==="expired"?undefined:preparedBrand);
  const identityOk=!!task?.signer&&(!expectedBrand||task.signer.pubkey===expectedBrand);
  const profileState:IdentityHealthCheckState=input.profile.matching>=2?"pass":input.profile.reachable>=2?"fail":"unknown";
  const profileDetail=profileState==="pass"?"The city-signed name, avatar and approved website were read back from at least two public profile relays.":
    profileState==="fail"?"The public city profile is missing a valid city name or avatar, or its website differs from the approved city identity on the readable profile relays.":"Fewer than two profile relays could be checked; no failure is inferred.";
  // Managed NIP-05 and Lightning activation already perform independent public
  // endpoint verification. Do not turn delayed kind-0 replication on unrelated
  // profile relays into a false managed-service failure; profile propagation is
  // assessed separately by the profile check above.
  const nip05State:IdentityHealthCheckState=input.nip05Verified?"pass":"fail";
  const lightningState:IdentityHealthCheckState=input.capabilities.lightning==="active"?"pass":"fail";
  const checks:CityIdentityHealthCheck[]=[
    check("identity","Dedicated city npub",identityOk?"pass":"fail",identityOk?(input.activationState==="active"?"The saved city signer matches the active BitcoinWalk city binding.":"The saved city signer matches the submitted BitcoinWalk city identity."):"A distinct saved city signer matching the submitted city identity is required."),
    check("profile","Profile and avatar",profileState,profileDetail),
    check("nip05","NIP-05 verification",nip05State,nip05State==="pass"?`${identifier} resolves to the exact city npub.`:`${identifier} is not currently verified against the exact city npub.`),
    check("lightning","Lightning address",lightningState,lightningState==="pass"?`${identifier} has passed managed LNURL-pay verification.`:`${identifier} is not currently active.`),
    check("binding","City binding",input.binding,input.binding==="pass"?"The signed city binding is active and its exact head agrees across authoritative read relays.":input.binding==="unknown"?"Authoritative relays could not all be checked; the existing binding was not changed.":input.activationState==="expired"?"The previous signed activation request expired before approval. The organizer must sign and submit a fresh request; the saved identity remains unchanged.":"No active binding with exact authoritative relay read-back was found."),
    check("recovery","Recovery acknowledgement",task?.signer?.confirmedAt?"pass":"fail",task?.signer?.confirmedAt?"The organizer confirmed a protected backup or remote-signer recovery method. BitcoinWalk stores no private key.":"The city signer still needs a confirmed recovery method."),
    check("publishing","City-signed publication","future","Future BW-118 scope. This does not prevent an otherwise healthy Pro identity from being complete."),
  ];
  const required=checks.filter(item=>item.state!=="future"&&item.state!=="not-applicable"),configured=!!task||!!active||input.capabilities.overall!=="setup-required";
  const status:IdentityHealthStatus=required.every(item=>item.state==="pass")?"complete":required.some(item=>item.state==="fail")?(configured?"action-required":"not-configured"):"unknown";
  const durable=[active?.verifiedAt,task?.updatedAt,input.activationUpdatedAt].filter((value):value is number=>typeof value==="number"&&value>0);
  return {cityId:input.cityId,cityName:input.cityName,slug:input.slug,availableInEnvironment:input.availableInEnvironment,tier:input.tier,status,...(input.activationState?{activationState:input.activationState}:{}),checks,checkedAt:input.checkedAt,...(durable.length?{lastVerifiedAt:Math.max(...durable)}:{})};
}

const table=(db:DatabaseSync,name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
function setupTask(db:DatabaseSync,cityId:string):ProSetupTask|null{
  if(!table(db,"pro_setup_task"))return null;
  const row=db.prepare("SELECT * FROM pro_setup_task WHERE cityId=?").get(cityId) as {cityId:string;state:ProSetupTask["state"];createdAt:number;updatedAt:number;
    registrationVersion:number|null;payoutVersion:number|null;brandPubkey:string|null;brandVersion:number;backupAcknowledgedAt:number|null;
    artworkRevisionId:string|null;artworkAvatar:string|null;artworkBanner:string|null;artworkVersion:number}|undefined;
  if(!row)return null;
  return {cityId:row.cityId,state:row.state,createdAt:row.createdAt,updatedAt:row.updatedAt,
    ...(row.registrationVersion===null?{}:{registrationVersion:row.registrationVersion}),...(row.payoutVersion===null?{}:{payoutVersion:row.payoutVersion}),
    ...(row.brandPubkey===null||row.backupAcknowledgedAt===null?{}:{signer:{pubkey:row.brandPubkey,version:row.brandVersion,confirmedAt:row.backupAcknowledgedAt}}),
    ...(row.artworkRevisionId===null||row.artworkAvatar===null||row.artworkBanner===null?{}:{artwork:{revisionId:row.artworkRevisionId,avatar:row.artworkAvatar,banner:row.artworkBanner,version:row.artworkVersion}})};
}
function activeBrand(db:DatabaseSync,cityId:string):ActiveBrand|null{
  if(!table(db,"city_brand_request")||!table(db,"city_brand_publication"))return null;
  const row=db.prepare(`SELECT r.challenge,r.approved_event,p.event_id,p.verified_at FROM city_brand_request r
    JOIN city_brand_publication p ON p.request_id=r.id WHERE r.city_id=? AND r.status='active' ORDER BY p.verified_at DESC LIMIT 1`).get(cityId) as
    {challenge:string;approved_event:string|null;event_id:string;verified_at:number}|undefined;
  if(!row?.approved_event)return null;
  try{const approved=JSON.parse(row.approved_event) as Event,challenge=JSON.parse(row.challenge) as CityBrandChallenge;if(approved.id!==row.event_id)return null;return {eventId:row.event_id,verifiedAt:row.verified_at,challenge};}catch{return null;}
}
function latestBrandRequest(db:DatabaseSync,cityId:string):{state:"pending"|"approved"|"active"|"expired";brandPubkey:string}|null{
  if(!table(db,"city_brand_request"))return null;
  const row=db.prepare("SELECT status,challenge FROM city_brand_request WHERE city_id=? AND status IN ('pending','approved','active','expired') ORDER BY rowid DESC LIMIT 1").get(cityId) as {status:"pending"|"approved"|"active"|"expired";challenge:string}|undefined;
  if(!row)return null;
  try{const challenge=JSON.parse(row.challenge) as CityBrandChallenge;return {state:row.status,brandPubkey:challenge.binding.brandPubkey};}catch{return null;}
}
function latestProfile(events:Event[],pubkey:string):PublicProfile|null{
  const requested=new Set([pubkey]);
  for(const event of events.filter(value=>value.pubkey===pubkey).sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id))){const profile=parsePublicProfile(event,requested);if(profile)return profile;}
  return null;
}
export function managedCityProfileMatches(profile:PublicProfile|null,active:ActiveBrand|null,cityName:string,canonicalWebsite?:string){
  const expected=active?.challenge.profile;
  if(!profile||!profile.name||!profile.picture||!profile.website||profile.website!==expected?.website&&profile.website!==canonicalWebsite)return false;
  return profile.name===expected?.name||profile.name===`BitcoinWalk ${cityName}`||profile.name===`BitcoinWalk in ${cityName}`;
}

/** A reviewed NIP-05 mapping is public-profile evidence only. It cannot satisfy
 * signer possession, recovery, a signed city binding or payout activation. */
export function identityHealthPubkey(active:ActiveBrand|null,request:{brandPubkey:string}|null,task:ProSetupTask|null,namedPubkey?:string){
  return active?.challenge.binding.brandPubkey??request?.brandPubkey??task?.signer?.pubkey??namedPubkey;
}

/** Read-only super-admin projection. It never creates an identity, retries provisioning or changes a public record. */
export async function listProCityIdentityHealth(actor:string):Promise<CityIdentityHealth[]>{
  if(actor!==SUPER_ADMIN_PUBKEY)throw new Error("Super-admin review required.");
  const checkedAt=Math.floor(Date.now()/1000),db=getPaymentRuntime().store.db,snapshot=await citySetupEvidence.snapshot(),cities=managedCities(snapshot.revisions,snapshot.approvals);
  const settled=new Set(table(db,"paid_city_entitlement")?(db.prepare("SELECT cityId FROM paid_city_entitlement").all() as {cityId:string}[]).map(row=>row.cityId):[]);
  const setupIds=new Set(table(db,"pro_setup_task")?(db.prepare("SELECT cityId FROM pro_setup_task").all() as {cityId:string}[]).map(row=>row.cityId):[]);
  const activeIds=new Set(table(db,"city_brand_request")?(db.prepare("SELECT DISTINCT city_id AS cityId FROM city_brand_request WHERE status='active'").all() as {cityId:string}[]).map(row=>row.cityId):[]);
  const live=cities.map(row=>{const city=row.revision.city,slug=row.decision.approval.slug??city.slug,aliases=row.decision.approval.aliases??city.aliases??[],operatorEntry=configuredPaidCityEntry(city.cityId,[slug,city.slug,...aliases]);return {cityId:city.cityId,cityName:city.cityName,slug,availableInEnvironment:true,operator:operatorEntry?.city,operatorCityId:operatorEntry?.cityId};});
  const covered=new Set(live.map(city=>city.operatorCityId).filter((cityId):cityId is string=>!!cityId));
  const definitions=[...live,...Object.entries(directoryConfig.paidCities).filter(([cityId])=>!covered.has(cityId)).map(([cityId,configured])=>({cityId,cityName:configured.cityName??configured.slug,slug:configured.slug,availableInEnvironment:false,operator:configured,operatorCityId:cityId}))];
  const identityDefinitions=definitions.filter(city=>!!city.operator||settled.has(city.cityId)||setupIds.has(city.cityId)||activeIds.has(city.cityId));
  const active=new Map(identityDefinitions.map(city=>[city.cityId,activeBrand(db,city.cityId)]));
  const requests=new Map(identityDefinitions.map(city=>[city.cityId,latestBrandRequest(db,city.cityId)]));
  const tasks=new Map(identityDefinitions.map(city=>[city.cityId,setupIds.has(city.cityId)?setupTask(db,city.cityId):null]));
  const publicBrands=new Map(identityDefinitions.map(city=>[city.cityId,identityHealthPubkey(active.get(city.cityId)??null,requests.get(city.cityId)??null,tasks.get(city.cityId)??null,activeNamedIdentity(db,city.slug)?.brandPubkey)]));
  const ids=identityDefinitions.map(city=>city.cityId),brands=[...new Set([...publicBrands.values()].filter((value):value is string=>!!value))];
  const bindingRelays=serverReadRelays(),bindingReads=ids.length?await Promise.all(bindingRelays.map(async relay=>{try{const events=await queryRelayEvents([relay],[30312],undefined,{authors:[SUPER_ADMIN_PUBKEY],"#i":ids,limit:500});return {relay,events,error:events.length>=500};}catch{return {relay,events:[] as Event[],error:true};}})):[];
  const publicProfileReads=brands.length?await Promise.all(profileRelays.map(async relay=>{try{return {relay,events:await queryRelayEvents([relay],[0],undefined,{authors:brands,limit:Math.min(500,Math.max(100,brands.length*5))}),error:false};}catch{return {relay,events:[] as Event[],error:true};}})):[];
  const publicOrigin=process.env.BITCOINWALK_PUBLIC_ORIGIN?.trim()||"https://bitcoinwalk.org";
  return Promise.all(definitions.map(async city=>{
    const {cityId,cityName,slug,availableInEnvironment}=city,provisioningCityId=city.operatorCityId??cityId,task=tasks.get(cityId)??null,current=active.get(cityId)??null,request=requests.get(cityId)??null;
    const staging=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN?.includes("app-staging.bitcoinwalk.org")??false;
    const tier=classifyCityIdentityTier({operatorConfirmed:!!city.operator,settled:settled.has(cityId),hasSetup:!!task,hasActiveBinding:!!current,staging});
    let binding:CityIdentityHealthEvidence["binding"]="fail";
    if(current){if(!bindingRelays.length||bindingReads.some(read=>read.error))binding="unknown";else binding=bindingReads.every(read=>resolveCityBrand(read.events.filter(event=>event.tags.some(tag=>tag[0]==="i"&&tag[1]===cityId)),cityId)?.event.id===current.eventId)?"pass":"fail";}
    const brand=publicBrands.get(cityId),identifier=`${slug}@bitcoinwalk.org`,profiles:ProfileEvidence={reachable:0,matching:0,nip05:0,lightning:0};
    if(brand)for(const read of publicProfileReads){if(read.error)continue;profiles.reachable++;const profile=latestProfile(read.events,brand);if(managedCityProfileMatches(profile,current,cityName,`${publicOrigin}/${slug}`))profiles.matching++;if(profile?.nip05===identifier)profiles.nip05++;if(profile?.lnurl===identifier)profiles.lightning++;}
    const capabilities=tier!=="basic"?cityProvisioningCapabilities(db,provisioningCityId):{overall:"setup-required",nip05:"setup-required",lightning:"setup-required",retryable:false,detail:"Not applicable."} as CityProvisioningCapabilities;
    const activation=table(db,"rustress_activation_task")?db.prepare("SELECT updated_at FROM rustress_activation_task WHERE city=?").get(provisioningCityId) as {updated_at:number}|undefined:undefined;
    const nip05Verified=!!brand&&await verifyNip05(brand,identifier);
    return summarizeCityIdentityHealth({cityId,cityName,slug,availableInEnvironment,tier,checkedAt,task,active:current,activationState:request?.state,preparedBrandPubkey:request?.brandPubkey??current?.challenge.binding.brandPubkey,binding,profile:profiles,capabilities,nip05Verified,activationUpdatedAt:activation?.updated_at});
  }));
}
