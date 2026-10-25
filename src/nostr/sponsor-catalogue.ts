import {compareEvents,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {SPONSOR_CATALOGUE_ID,SPONSOR_CATALOGUE_KIND,sponsorCatalogueRecordSchema,type SponsorCatalogueRecord,type SponsorCatalogueRecordInput} from "../domain/sponsor-catalogue";
import {isSuperAdmin} from "./authority";
import {queryRelayEvents} from "./city-records";

export type SponsorCatalogueRevision={event:Event;record:SponsorCatalogueRecord};
export type SponsorCatalogueEntry={pubkey:string;displayName:string;website:string;logoHash:string;cityId:string;scopeKey:string;approvalEventId:string;source:"legacy-assignment"|"self-claim"};
function one(event:Event,name:string){const tags=event.tags.filter(tag=>tag[0]===name&&tag.length===2);return tags.length===1?tags[0][1]:null;}
function marker(record:SponsorCatalogueRecord){return record.recordType==="claim"?record.state:record.status;}
export function parseSponsorCatalogueRevision(event:Event):SponsorCatalogueRevision|null{
 if(event.kind!==SPONSOR_CATALOGUE_KIND||!verifyEvent(event))return null;
 try{
  const parsed=sponsorCatalogueRecordSchema.safeParse(JSON.parse(event.content));if(!parsed.success)return null;
  const record=parsed.data,previous=event.tags.filter(tag=>tag[0]==="e"&&tag.length===4&&tag[2]===""&&tag[3]==="previous"),source=event.tags.filter(tag=>tag[0]==="e"&&tag.length===4&&tag[2]===""&&tag[3]==="source"),allowed=new Set(["d","i","p","record","state","client","e"]),exact=event.tags.every(tag=>allowed.has(tag[0])&&(tag[0]!=="e"?tag.length===2:tag.length===4&&tag[2]===""&&["previous","source"].includes(tag[3])));
  if(!exact||one(event,"d")?.startsWith(`${SPONSOR_CATALOGUE_ID}:${record.recordType}:${record.sponsorPubkey}:`)!==true||one(event,"i")!==SPONSOR_CATALOGUE_ID||one(event,"p")!==record.sponsorPubkey||one(event,"record")!==record.recordType||one(event,"state")!==marker(record)||one(event,"client")!=="bitcoinwalk.org")return null;
  if(previous.length!==(record.previousRevisionId?1:0)||record.previousRevisionId&&previous[0][1]!==record.previousRevisionId)return null;
  if(record.recordType==="claim"&&(event.pubkey!==record.sponsorPubkey||source.length))return null;
  if(record.recordType==="approval"&&(!isSuperAdmin(event.pubkey)||source.length!==1||source[0][1]!==record.sourceEventId))return null;
  return {event,record};
 }catch{return null;}
}
export function createSponsorCatalogueRevision(input:SponsorCatalogueRecordInput):EventTemplate{
 const record=sponsorCatalogueRecordSchema.parse(input),state=marker(record);
 return {kind:SPONSOR_CATALOGUE_KIND,created_at:Math.floor(Date.now()/1000),content:JSON.stringify(record),tags:[["d",`${SPONSOR_CATALOGUE_ID}:${record.recordType}:${record.sponsorPubkey}:${crypto.randomUUID()}`],["i",SPONSOR_CATALOGUE_ID],["p",record.sponsorPubkey],["record",record.recordType],["state",state],["client","bitcoinwalk.org"],...(record.previousRevisionId?[["e",record.previousRevisionId,"","previous"]]:[]),...(record.recordType==="approval"?[["e",record.sourceEventId,"","source"]]:[])]};
}
export function latestSponsorCatalogueRevisions(rows:SponsorCatalogueRevision[]){
 const latest=new Map<string,SponsorCatalogueRevision>();for(const row of [...rows].sort((a,b)=>compareEvents(a.event,b.event))){const key=`${row.record.recordType}:${row.record.sponsorPubkey}`;if(!latest.has(key))latest.set(key,row);}return [...latest.values()];
}
export function latestSponsorCatalogueClaim(rows:SponsorCatalogueRevision[],pubkey:string){return latestSponsorCatalogueRevisions(rows).find(row=>row.record.recordType==="claim"&&row.record.sponsorPubkey===pubkey)??null;}
export function sponsorCatalogueEntries(rows:SponsorCatalogueRevision[]):SponsorCatalogueEntry[]{
 const latest=latestSponsorCatalogueRevisions(rows),withdrawn=new Set(latest.filter(row=>row.record.recordType==="claim"&&row.record.state==="withdrawn").map(row=>row.record.sponsorPubkey));
 return latest.filter(row=>row.record.recordType==="approval"&&row.record.status==="approved"&&!withdrawn.has(row.record.sponsorPubkey)).map(row=>{const value=row.record as Extract<SponsorCatalogueRecord,{recordType:"approval"}>;return {pubkey:value.sponsorPubkey,displayName:value.displayName,website:value.website??"",logoHash:value.logoHash,cityId:value.sourceCityId,scopeKey:value.sourceScopeKey,approvalEventId:row.event.id,source:value.source};}).sort((a,b)=>a.displayName.localeCompare(b.displayName)||a.pubkey.localeCompare(b.pubkey));
}
export async function querySponsorCatalogue(relays:string[]):Promise<SponsorCatalogueRevision[]>{const events=await queryRelayEvents(relays,[SPONSOR_CATALOGUE_KIND],undefined,{"#i":[SPONSOR_CATALOGUE_ID],limit:500});return events.map(parseSponsorCatalogueRevision).filter((row):row is SponsorCatalogueRevision=>row!==null);}
