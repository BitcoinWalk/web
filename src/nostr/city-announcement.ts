import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import type {CalendarWalk} from "./calendar-records";
import {calendarNevent,calendarOccurrence,matchesInitialCalendar} from "./calendar-records";
import {queryRelayEvents} from "./city-records";
import {isSuperAdmin,SUPER_ADMIN_PUBKEY} from "./authority";

export const CITY_ANNOUNCEMENT_KIND=1;
export const CITY_ANNOUNCEMENT_MARKER="new-city-announcement-v1";

export type CityAnnouncementCandidate={walk:CalendarWalk;event:Event;countryCode:string;url:string;content:string};

function one(event:Event,name:string){const rows=event.tags.filter(tag=>tag[0]===name&&tag.length===2);return rows.length===1?rows[0][1]:null;}
function reference(event:Event,marker:string){const rows=event.tags.filter(tag=>tag[0]==="e"&&tag.length===4&&tag[2]===""&&tag[3]===marker);return rows.length===1?rows[0][1]:null;}

export function countryFlag(countryCode:string):string{
 const code=countryCode.trim().toUpperCase();
 if(!/^[A-Z]{2}$/.test(code))throw new Error("A verified two-letter country code is required before preparing an announcement.");
 return [...code].map(letter=>String.fromCodePoint(127397+letter.charCodeAt(0))).join("");
}

export function cityAnnouncementCandidate(walk:CalendarWalk,event:Event,relays:string[]):CityAnnouncementCandidate{
 const city=walk.revision.city,occurrence=calendarOccurrence(event),countryCode=city.countryCode;
 if(!countryCode)throw new Error("This city has no signed country code. Correct the city profile before announcing it.");
 if(!matchesInitialCalendar(event,walk)||!occurrence?.timeZone)throw new Error("The approved first walk and its local timezone could not be verified.");
 const date=new Date(occurrence.start*1000),day=new Intl.DateTimeFormat("en-GB",{weekday:"long",timeZone:occurrence.timeZone}).format(date),dateLabel=new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:occurrence.timeZone}).format(date),time=new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:occurrence.timeZone}).format(date),nevent=calendarNevent(event,relays),url=`https://bitcoinwalk.org/${encodeURIComponent(city.slug)}/${nevent}`;
 return {walk,event,countryCode,url,content:`New chapter of BitcoinWalk starting in ${city.cityName}! ${countryFlag(countryCode)} You are welcome to join us on ${day} ${dateLabel} ${time}. Bring a friend.\n\n${url}`};
}

export function createCityAnnouncement(candidate:CityAnnouncementCandidate,createdAt=Math.floor(Date.now()/1000)):EventTemplate{
 const {walk,event,content,url,countryCode}=candidate,city=walk.revision.city;
 return {kind:CITY_ANNOUNCEMENT_KIND,created_at:createdAt,content,tags:[
  ["t","bitcoinwalk"],["t","bitcoinwalk-city"],["bitcoinwalk",CITY_ANNOUNCEMENT_MARKER],["i",city.cityId],["country",countryCode],["r",url],
  ["e",walk.revision.event.id,"","city-revision"],["e",walk.approval.event.id,"","city-approval"],["e",event.id,"","first-walk"],
 ]};
}

export function matchesCityAnnouncement(event:Event,candidate:CityAnnouncementCandidate):boolean{
 if(event.kind!==CITY_ANNOUNCEMENT_KIND||!isSuperAdmin(event.pubkey)||!verifyEvent(event))return false;
 const expected=createCityAnnouncement(candidate,event.created_at),expectedTags=JSON.stringify(expected.tags);
 return event.content===expected.content&&JSON.stringify(event.tags)===expectedTags&&one(event,"bitcoinwalk")===CITY_ANNOUNCEMENT_MARKER&&reference(event,"first-walk")===candidate.event.id;
}

export async function queryCityAnnouncements(relays:string[],cityIds:string[]):Promise<Event[]>{
 if(!relays.length||!cityIds.length)return [];
 return (await queryRelayEvents(relays,[CITY_ANNOUNCEMENT_KIND],undefined,{authors:[SUPER_ADMIN_PUBKEY],"#i":cityIds,limit:200})).filter(event=>isSuperAdmin(event.pubkey)&&verifyEvent(event)&&one(event,"bitcoinwalk")===CITY_ANNOUNCEMENT_MARKER);
}
