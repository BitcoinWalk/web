import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {ORGANIZER_ROOM_DESTINATION} from "./nip29-chat";

const hex=/^[0-9a-f]{64}$/;
export type OrganizerGuideCity={organizerPubkey:string;guidePubkey:string};

export function organizerRoomMembers(cities:OrganizerGuideCity[],hqPubkey:string){
 const values=[hqPubkey,...cities.flatMap(city=>[city.organizerPubkey,city.guidePubkey])];
 if(values.some(value=>!hex.test(value)))throw new Error("The organizer-room member list is invalid.");
 return [...new Set(values)].sort();
}

export function organizerRoomMetadataTemplate(now=Math.floor(Date.now()/1000)):EventTemplate{
 return {kind:9002,created_at:now,tags:[["h",ORGANIZER_ROOM_DESTINATION.groupId],["name","BitcoinWalk Organizers"],["about","A private room for current BitcoinWalk city organizers, BitcoinWalk Guide and BitcoinWalk HQ."],["picture","https://bitcoinwalk.org/brand/bitcoinwalk-icon.png"],["private"],["restricted"],["closed"],["supported_kinds","9"]],content:"Configure the private BitcoinWalk organizer room."};
}

export function organizerRoomRosterPlan(current:string[],desired:string[]){
 const before=new Set(current.filter(value=>hex.test(value))),after=new Set(desired);
 return {add:[...after].filter(value=>!before.has(value)).sort(),remove:[...before].filter(value=>!after.has(value)).sort()};
}

function oneTag(event:Event,name:string,value?:string){const tags=event.tags.filter(tag=>tag[0]===name);return tags.length===1&&(value===undefined?tags[0].length===1:tags[0].length===2&&tags[0][1]===value);}
export function verifiedOrganizerRoomMetadata(events:Event[],relayPubkey:string){
 return events.some(event=>event.kind===39000&&verifyEvent(event)&&event.pubkey===relayPubkey&&oneTag(event,"d",ORGANIZER_ROOM_DESTINATION.groupId)&&oneTag(event,"name","BitcoinWalk Organizers")&&oneTag(event,"private")&&oneTag(event,"restricted")&&oneTag(event,"closed"));
}
