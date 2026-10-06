import {managedMediaHash} from "./hero-presentation";
import {previewText} from "./share-preview";

export const MANCHESTER_BITFEST_MEDIA_HASH="d64d013aee80e3382f0ef7576df259535c57b7d4d4ce5a07fa1a65bab16e21df";

export function isManchesterBitfestCampaign(slug:string,images:Array<string|null|undefined>):boolean{
  return slug==="manchester"&&images.some(value=>managedMediaHash(value)===MANCHESTER_BITFEST_MEDIA_HASH);
}

export function manchesterBitfestCityPreview(){
  return {
    title:"BitcoinWalk at Bitfest Manchester | Conference walk",
    description:"Join BitcoinWalk at Bitfest in Manchester for a friendly conference walk, local Bitcoin conversation and an easy way to meet fellow Bitcoiners.",
  };
}

export function manchesterBitfestWalkPreview(input:{start:number;end:number;timeZone:string|null;meetingPoint:string},now=Date.now()){
  const date=new Date(input.start*1000),zone=input.timeZone||"UTC",past=input.end*1000<now;
  const fullDate=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:zone}).format(date);
  const shortDate=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:zone}).format(date);
  const time=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",hour12:true,timeZone:zone}).format(date)+(input.timeZone?"":" UTC");
  const place=previewText(input.meetingPoint,65).replace(/[.!?]+$/g,""),meeting=/^(outside|inside|near|by|opposite|beside)\b/i.test(place)?place.charAt(0).toLowerCase()+place.slice(1):`at ${place}`;
  return {
    title:previewText(`BitcoinWalk at Bitfest | ${past?"Past event · ":""}${fullDate}`,65),
    description:previewText(past
      ?`BitcoinWalk at Bitfest in Manchester took place on ${shortDate} at ${time}. Meeting point: ${place}.`
      :`Join BitcoinWalk at Bitfest in Manchester on ${shortDate} at ${time}. Meet ${meeting} for a friendly walk and conversation.`,160),
  };
}
