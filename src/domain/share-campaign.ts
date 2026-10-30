import {managedMediaHash} from "./hero-presentation";
import {previewText} from "./share-preview";

export const MANCHESTER_BITFEST_MEDIA_HASH="d64d013aee80e3382f0ef7576df259535c57b7d4d4ce5a07fa1a65bab16e21df";
export const LUGANO_PLANB_MEDIA_HASH="e99b21814905774a3a798987f81c5f4f4cc02bf69f8de2b90f5599fbba62119c";
export const LUGANO_PLANB_CITYSCAPE_MEDIA_HASH="8b4c5fbb82acd561798c438f0422d7ca33a94f46aaefc6a7427bbd8429fa7e63";

export function isAmsterdamConference(slug:string):boolean{
  return slug==="amsterdam";
}

export function isManchesterBitfestCampaign(slug:string,images:Array<string|null|undefined>):boolean{
  return slug==="manchester"&&images.some(value=>managedMediaHash(value)===MANCHESTER_BITFEST_MEDIA_HASH);
}

export function isLuganoPlanBConference(slug:string,images:Array<string|null|undefined>):boolean{
  const approvedHeroes=new Set([LUGANO_PLANB_MEDIA_HASH,LUGANO_PLANB_CITYSCAPE_MEDIA_HASH]);
  return slug==="lugano"&&images.some(value=>approvedHeroes.has(managedMediaHash(value)??""));
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

export function luganoPlanBCityPreview(){
  return {
    title:"BitcoinWalk at Plan ₿ Forum Lugano | Conference side event",
    description:"Join the BitcoinWalk conference side event in Lugano after Plan ₿ Forum 2026: a friendly Sunday walk from the Satoshi Nakamoto statue in Parco Ciani.",
  };
}

export function luganoPlanBWalkPreview(input:{start:number;end:number;timeZone:string|null;meetingPoint:string},now=Date.now()){
  const zone=input.timeZone||"Europe/Zurich",date=new Date(input.start*1000),past=input.end*1000<now;
  const fullDate=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:zone}).format(date);
  const shortDate=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:zone}).format(date);
  const time=new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:zone}).format(date);
  const place=previewText(input.meetingPoint||"the meeting point",72),meeting=place.toLowerCase().startsWith("outside ")?place:`at ${place}`;
  return {
    title:previewText(`BitcoinWalk at Plan ₿ Forum | ${past?"Past event · ":""}${fullDate}`,70),
    description:previewText(past
      ?`The BitcoinWalk conference side event in Lugano took place on ${shortDate} at ${time}. Meeting point: ${place}.`
      :`Join the BitcoinWalk Plan ₿ Forum side event in Lugano on ${shortDate} at ${time}. Meet ${meeting} for a friendly walk and conversation.`,160),
  };
}
