import {nip19,verifyEvent,compareEvents,type Event} from "nostr-tools";
import {isSuperAdmin} from "./authority";
import {createApprovedCalendarEvent} from "./calendar-event";
import {queryDirectoryRecords,queryCalendarEvents,type CityRevision,type ApprovalRecord} from "./city-records";
import {allTrailsRoute} from "../domain/walk-route";
import {occurrenceDays} from "../domain/walk-schedule";
import {encodeGeohash} from "../domain/geohash";

export type CalendarSource={revision:CityRevision;approval:ApprovalRecord};
export type CalendarWalk=CalendarSource&{initialRelease?:CalendarSource;approvedSources?:CalendarSource[]};
/** A later profile approval must not discard the released first walk's image. */
export function initialCalendarHero(event:Event,walk:CalendarWalk):string|undefined {
  if(!matchesInitialCalendar(event,walk))return undefined;
  const source=walk.initialRelease??walk;
  return source.approval.approval.heroImageUrl??source.revision.city.heroImageUrl;
}
export function approvedCalendarWalks(revisions:CityRevision[],decisions:ApprovalRecord[]):CalendarWalk[] {
  const result:CalendarWalk[]=[];
  const approvedSources=new Map<string,CalendarSource[]>();
  const initialReleases=new Map<string,CalendarSource>();
  for(const record of [...decisions].sort((a,b)=>compareEvents(a.event,b.event))){
    const decision=record.approval;
    if(decision.status!=="approved")continue;
    const revision=revisions.find(item=>item.city.cityId===decision.cityId&&item.event.id===decision.cityRevisionId);
    if(!revision)continue;
    const source={revision,approval:record};
    const sources=approvedSources.get(decision.cityId)??[];
    sources.push(source);approvedSources.set(decision.cityId,sources);
    if(!initialReleases.has(decision.cityId)&&(decision.initialEventId||decision.initialEventIds?.length))initialReleases.set(decision.cityId,source);
  }
  const finished=new Set<string>(),rejected=new Map<string,Set<string>>();
  for(const record of [...decisions].sort((a,b)=>compareEvents(a.event,b.event))) {
    const d=record.approval;
    if(finished.has(d.cityId))continue;
    if(d.status==="rejected") {const ids=rejected.get(d.cityId)??new Set<string>();ids.add(d.cityRevisionId);rejected.set(d.cityId,ids);continue;}
    finished.add(d.cityId);
    if(d.status!=="approved"||rejected.get(d.cityId)?.has(d.cityRevisionId))continue;
    const revision=revisions.find(r=>r.city.cityId===d.cityId&&r.event.id===d.cityRevisionId);
    const historical=(approvedSources.get(d.cityId)??[]).filter(source=>source.approval.event.id!==record.event.id);
    if(revision){
      const city={...revision.city,...(d.slug?{slug:d.slug}:{}),...(d.aliases?.length?{aliases:d.aliases}:{aliases:undefined}),...(d.heroImageUrl?{heroImageUrl:d.heroImageUrl}:{})};
      result.push({revision:{...revision,city},approval:record,...(initialReleases.has(d.cityId)?{initialRelease:initialReleases.get(d.cityId)}:{}),...(historical.length?{approvedSources:historical}:{})});
    }
  }
  return result.sort((a,b)=>a.revision.city.cityName.localeCompare(b.revision.city.cityName));
}
export async function loadCalendarWalks(relays:string[]):Promise<CalendarWalk[]> {
  const {revisions,approvals}=await queryDirectoryRecords(relays);
  return approvedCalendarWalks(revisions,approvals);
}
/** Read validation only: new publications must still reference the current approval.
 * Sources are retained approved records, attached only to a currently public city.
 * Event cancellation remains authoritative in the managed relay's public reads.
 */
export function calendarEventSource(event:Event,walk:CalendarWalk):CalendarWalk|null {
  if(walk.approval.approval.status!=="approved")return null;
  if(matchesCalendar(event,walk)||matchesOrganizerCalendar(event,walk)||matchesInitialCalendar(event,walk))return walk;
  const revisionId=source(event,"city-revision"),approvalId=source(event,"city-approval");
  const historical=walk.approvedSources?.find(candidate=>candidate.revision.city.cityId===walk.revision.city.cityId&&candidate.approval.approval.cityId===walk.revision.city.cityId&&candidate.approval.approval.status==="approved"&&candidate.approval.approval.cityRevisionId===candidate.revision.event.id&&candidate.revision.event.id===revisionId&&candidate.approval.event.id===approvalId);
  return historical&&matchesOrganizerCalendar(event,historical)?historical:null;
}
const orderedTags=(tags:string[][])=>JSON.stringify(tags.map(t=>JSON.stringify(t)).sort());
function matchesExpectedTags(event:Event,expected:string[][]):boolean {const actual=orderedTags(event.tags);if(actual===orderedTags(expected))return true;return one(event,"g")===null&&actual===orderedTags(expected.filter(tag=>tag[0]!=="g"));}
export function matchesCalendar(event:Event,walk:CalendarWalk):boolean {
  if(event.kind!==31923||!isSuperAdmin(event.pubkey)||!verifyEvent(event))return false;
  const expected=createApprovedCalendarEvent(walk.revision.city,walk.revision.event.id,walk.approval.event.id);
  return event.content===expected.content&&matchesExpectedTags(event,expected.tags);
}
function one(event:Event,name:string):string|null {const tags=event.tags.filter(t=>t[0]===name&&t.length===2);return tags.length===1&&tags[0][1]?tags[0][1]:null;}
function source(event:Event,marker:string):string|null {const tags=event.tags.filter(t=>t[0]==="e"&&t.length===4&&t[2]===""&&t[3]===marker);return tags.length===1?tags[0][1]:null;}
function matchesOccurrenceDays(event:Event,start:number,end:number):boolean {try{const actual=event.tags.filter(tag=>tag[0]==="D"&&tag.length===2).map(tag=>tag[1]);return JSON.stringify(actual)===JSON.stringify(occurrenceDays(start,end));}catch{return false;}}
function matchesGeohash(event:Event,latitude:number,longitude:number):boolean {const geohash=one(event,"g");return geohash===null||geohash===encodeGeohash(latitude,longitude);}
const managedImage=/^https:\/\/(?:app-staging\.)?bitcoinwalk\.org\/api\/media\/files\/[0-9a-f]{64}\.webp$/;
export function calendarImageOverride(event:Event):string|null {const marker=one(event,"bitcoinwalk-image"),image=one(event,"image");return marker==="override-v1"&&image&&managedImage.test(image)?image:null;}
export function calendarRoute(event:Event):string|null {if(one(event,"bitcoinwalk-route")!=="alltrails-v1")return null;for(const tag of event.tags.filter(tag=>tag[0]==="r"&&tag.length===2)){try{const route=allTrailsRoute(tag[1]);if(route)return route.url;}catch{}}return null;}
export function matchesOrganizerCalendar(event:Event,walk:CalendarWalk):boolean {
  if(event.kind!==31923||isSuperAdmin(event.pubkey)||!verifyEvent(event))return false;
  const city=walk.revision.city;
  if(one(event,"bitcoinwalk")!=="occurrence-v1"||one(event,"i")!==city.cityId||source(event,"city-revision")!==walk.revision.event.id||source(event,"city-approval")!==walk.approval.event.id)return false;
  const override=calendarImageOverride(event),marker=one(event,"bitcoinwalk-image");
  if(marker!==null&&marker!=="override-v1"||marker==="override-v1"&&!override)return false;
  if(one(event,"title")!==`BitcoinWalk ${city.cityName}`||one(event,"summary")!==`BitcoinWalk in ${city.cityName}`||(!override&&one(event,"image")!==(city.heroImageUrl??null))||one(event,"t")!=="bitcoinwalk"||event.content.trim().length<1||event.content.length>5000)return false;
  const start=Number(one(event,"start")),end=Number(one(event,"end"));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start<900||end-start>43200||!matchesOccurrenceDays(event,start,end))return false;
  const zone=one(event,"start_tzid");if(!zone||one(event,"end_tzid")!==zone)return false;
  const locations=event.tags.filter(t=>t[0]==="location"&&t.length===2);if(locations.length!==2||!locations[0][1])return false;
  const coords=locations[1][1].split(",").map(Number);if(coords.length!==2||!Number.isFinite(coords[0])||Math.abs(coords[0])>90||!Number.isFinite(coords[1])||Math.abs(coords[1])>180)return false;
  if(!matchesGeohash(event,coords[0],coords[1]))return false;
  const links=event.tags.filter(t=>t[0]==="r"&&t.length===2).map(t=>t[1]),route=calendarRoute(event);if(one(event,"bitcoinwalk-route")!==null&&!route)return false;const expected=[...(city.chatUrl?[city.chatUrl]:[]),...(route?[route]:[])];if(links.length!==expected.length||expected.some(link=>!links.includes(link)))return false;
  return true;
}
export function matchesInitialCalendar(event:Event,walk:CalendarWalk):boolean {
  const source=walk.initialRelease??walk,city=source.revision.city;
  const released=source.approval.approval.initialEventIds??(source.approval.approval.initialEventId?[source.approval.approval.initialEventId]:[]);
  if(city.cityId!==walk.revision.city.cityId||event.kind!==31923||!verifyEvent(event)||event.pubkey!==source.revision.event.pubkey||!released.includes(event.id))return false;
  if(one(event,"bitcoinwalk")!=="initial-proposal-v1"||one(event,"i")!==city.cityId||one(event,"title")!==`BitcoinWalk ${city.cityName}`||one(event,"summary")!==`BitcoinWalk in ${city.cityName}`||one(event,"image")!==(city.heroImageUrl??null)||one(event,"t")!=="bitcoinwalk"||event.content!==city.description)return false;
  const starts=city.initialWalkStarts??[city.startAt];
  const start=Number(one(event,"start")),end=Number(one(event,"end"));if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start!==3600||!starts.some(value=>new Date(value).getTime()/1000===start)||!matchesOccurrenceDays(event,start,end))return false;
  const zone=one(event,"start_tzid");if(!zone||one(event,"end_tzid")!==zone)return false;
  const locations=event.tags.filter(t=>t[0]==="location"&&t.length===2);if(locations.length!==2||locations[0][1]!==city.meetingPoint.description||locations[1][1]!==`${city.meetingPoint.latitude},${city.meetingPoint.longitude}`)return false;
  if(!matchesGeohash(event,city.meetingPoint.latitude,city.meetingPoint.longitude))return false;
  const links=event.tags.filter(t=>t[0]==="r"&&t.length===2).map(t=>t[1]),route=calendarRoute(event);if(one(event,"bitcoinwalk-route")!==null&&!route)return false;const expected=[...(city.chatUrl?[city.chatUrl]:[]),...(route?[route]:[])];if(links.length!==expected.length||expected.some(link=>!links.includes(link)))return false;
  return event.tags.filter(t=>t[0]==="e").length===0;
}
export function calendarOccurrence(event:Event){
  const start=Number(one(event,"start")),end=Number(one(event,"end")),locations=event.tags.filter(t=>t[0]==="location"&&t.length===2),coords=locations[1]?.[1]?.split(",").map(Number);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||locations.length!==2||coords?.length!==2)return null;
  return {start,end,timeZone:one(event,"start_tzid"),meetingPoint:{description:locations[0][1],latitude:coords[0],longitude:coords[1]}};
}
export function calendarNevent(event:Event,relays:string[]):string {
  return nip19.neventEncode({id:event.id,author:event.pubkey,kind:31923,relays:relays.filter(r=>r.startsWith("wss://")).slice(0,5)});
}
export function decodeCalendarLink(value:string):string|null {
  if(value.length>2048||!value.startsWith("nevent1"))return null;
  try {const decoded=nip19.decode(value);if(decoded.type!=="nevent" || (decoded.data.kind!==undefined&&decoded.data.kind!==31923))return null;return decoded.data.id;}catch{return null;}
}
export async function resolveCalendarLink(value:string,relays:string[]):Promise<{event:Event;walk:CalendarWalk;currentProfile:CalendarSource}|null> {
  const id=decodeCalendarLink(value);if(!id)return null;
  // Relay hints in user-controlled links are never used for network requests.
  const events=await queryCalendarEvents(relays,{ids:[id]});
  const event=events.find(e=>e.id===id);if(!event)return null;
  const walks=await loadCalendarWalks(relays);
  const currentProfile=walks.find(w=>w.revision.city.cityId===one(event,"i"));
  if(!currentProfile)return null;
  const walk=calendarEventSource(event,currentProfile);
  return walk?{event,walk,currentProfile}:null;
}
