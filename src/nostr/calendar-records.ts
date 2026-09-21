import {nip19,verifyEvent,compareEvents,type Event} from "nostr-tools";
import {isSuperAdmin} from "./authority";
import {createApprovedCalendarEvent} from "./calendar-event";
import {queryDirectoryRecords,queryCalendarEvents,type CityRevision,type ApprovalRecord} from "./city-records";

export type CalendarWalk={revision:CityRevision;approval:ApprovalRecord};
export function approvedCalendarWalks(revisions:CityRevision[],decisions:ApprovalRecord[]):CalendarWalk[] {
  const result:CalendarWalk[]=[];
  const finished=new Set<string>(),rejected=new Map<string,Set<string>>();
  for(const record of [...decisions].sort((a,b)=>compareEvents(a.event,b.event))) {
    const d=record.approval;
    if(finished.has(d.cityId))continue;
    if(d.status==="rejected") {const ids=rejected.get(d.cityId)??new Set<string>();ids.add(d.cityRevisionId);rejected.set(d.cityId,ids);continue;}
    finished.add(d.cityId);
    if(d.status!=="approved"||rejected.get(d.cityId)?.has(d.cityRevisionId))continue;
    const revision=revisions.find(r=>r.city.cityId===d.cityId&&r.event.id===d.cityRevisionId);
    if(revision)result.push({revision,approval:record});
  }
  return result.sort((a,b)=>a.revision.city.cityName.localeCompare(b.revision.city.cityName));
}
export async function loadCalendarWalks(relays:string[]):Promise<CalendarWalk[]> {
  const {revisions,approvals}=await queryDirectoryRecords(relays);
  return approvedCalendarWalks(revisions,approvals);
}
const orderedTags=(tags:string[][])=>JSON.stringify(tags.map(t=>JSON.stringify(t)).sort());
export function matchesCalendar(event:Event,walk:CalendarWalk):boolean {
  if(event.kind!==31923||!isSuperAdmin(event.pubkey)||!verifyEvent(event))return false;
  const expected=createApprovedCalendarEvent(walk.revision.city,walk.revision.event.id,walk.approval.event.id);
  return event.content===expected.content&&orderedTags(event.tags)===orderedTags(expected.tags);
}
function one(event:Event,name:string):string|null {const tags=event.tags.filter(t=>t[0]===name&&t.length===2);return tags.length===1&&tags[0][1]?tags[0][1]:null;}
function source(event:Event,marker:string):string|null {const tags=event.tags.filter(t=>t[0]==="e"&&t.length===4&&t[2]===""&&t[3]===marker);return tags.length===1?tags[0][1]:null;}
export function matchesOrganizerCalendar(event:Event,walk:CalendarWalk):boolean {
  if(event.kind!==31923||isSuperAdmin(event.pubkey)||!verifyEvent(event))return false;
  const city=walk.revision.city;
  if(one(event,"bitcoinwalk")!=="occurrence-v1"||one(event,"i")!==city.cityId||source(event,"city-revision")!==walk.revision.event.id||source(event,"city-approval")!==walk.approval.event.id)return false;
  if(one(event,"title")!==`BitcoinWalk ${city.cityName}`||one(event,"summary")!==`BitcoinWalk in ${city.cityName}`||one(event,"image")!==city.heroImageUrl||one(event,"t")!=="bitcoinwalk"||event.content!==city.description)return false;
  const start=Number(one(event,"start")),end=Number(one(event,"end"));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start<900||end-start>43200||one(event,"D")!==String(Math.floor(start/86400)))return false;
  const zone=one(event,"start_tzid");if(!zone||one(event,"end_tzid")!==zone)return false;
  const locations=event.tags.filter(t=>t[0]==="location"&&t.length===2);if(locations.length!==2||!locations[0][1])return false;
  const coords=locations[1][1].split(",").map(Number);if(coords.length!==2||!Number.isFinite(coords[0])||Math.abs(coords[0])>90||!Number.isFinite(coords[1])||Math.abs(coords[1])>180)return false;
  const links=event.tags.filter(t=>t[0]==="r"&&t.length===2).map(t=>t[1]);if(city.chatUrl?(links.length!==1||links[0]!==city.chatUrl):links.length!==0)return false;
  return true;
}
export function calendarOccurrence(event:Event){
  const start=Number(one(event,"start")),end=Number(one(event,"end")),locations=event.tags.filter(t=>t[0]==="location"&&t.length===2),coords=locations[1]?.[1]?.split(",").map(Number);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||locations.length!==2||coords?.length!==2)return null;
  return {start,end,timeZone:one(event,"start_tzid"),meetingPoint:{description:locations[0][1],latitude:coords[0],longitude:coords[1]}};
}
export function calendarNevent(event:Event,relays:string[]):string {
  return nip19.neventEncode({id:event.id,author:event.pubkey,kind:31923,relays:relays.filter(r=>r.startsWith("wss://")).slice(0,3)});
}
export function decodeCalendarLink(value:string):string|null {
  if(value.length>2048||!value.startsWith("nevent1"))return null;
  try {const decoded=nip19.decode(value);if(decoded.type!=="nevent" || (decoded.data.kind!==undefined&&decoded.data.kind!==31923))return null;return decoded.data.id;}catch{return null;}
}
export async function resolveCalendarLink(value:string,relays:string[]):Promise<{event:Event;walk:CalendarWalk}|null> {
  const id=decodeCalendarLink(value);if(!id)return null;
  // Relay hints in user-controlled links are never used for network requests.
  const events=await queryCalendarEvents(relays,{ids:[id]});
  const event=events.find(e=>e.id===id);if(!event)return null;
  const walks=await loadCalendarWalks(relays);
  let walk=walks.find(w=>matchesCalendar(event,w)||matchesOrganizerCalendar(event,w));
  if(!walk){
    const revisionId=source(event,"city-revision"),approvalId=source(event,"city-approval"),cityId=one(event,"i");
    const current=cityId&&walks.some(w=>w.revision.city.cityId===cityId);
    if(revisionId&&approvalId&&current){
      const {revisions,approvals}=await queryDirectoryRecords(relays);
      const revision=revisions.find(r=>r.event.id===revisionId&&r.city.cityId===cityId);
      const approval=approvals.find(a=>a.event.id===approvalId&&a.approval.status==="approved"&&a.approval.cityId===cityId&&a.approval.cityRevisionId===revisionId);
      if(revision&&approval){const historical={revision,approval};if(matchesOrganizerCalendar(event,historical))walk=historical;}
    }
  }
  return walk?{event,walk}:null;
}
