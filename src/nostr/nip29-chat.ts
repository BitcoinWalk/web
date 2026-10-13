import {compareEvents,verifyEvent,type Event,type EventTemplate} from "nostr-tools";

export type Nip29Destination={relay:string;groupId:string};
export type Nip29Message={id:string;pubkey:string;content:string;createdAt:number};
export type Nip29CityRoom={id:string;name:string;slug:string;chat:{scope:"global"|"city";nip29:Nip29Destination|null}};
export type Nip29Room={key:string;label:string;scope:"global"|"city";cityIds:string[];destination:Nip29Destination};

const hex=/^[0-9a-f]{64}$/;

export function validNip29Destination(value:unknown):Nip29Destination|null{
 if(!value||typeof value!=="object")return null;
 const {relay,groupId}=value as Partial<Nip29Destination>;
 if(typeof relay!=="string"||typeof groupId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(groupId))return null;
 try{
  const url=new URL(relay),host=url.hostname.toLowerCase();
  if(url.protocol!=="wss:"||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash||!(host==="chat.bitcoinwalk.org"||host==="chat-staging.bitcoinwalk.org"||/^[a-z0-9-]+\.bitcoinwalk\.org$/.test(host)))return null;
  return {relay:url.href,groupId};
 }catch{return null;}
}

export function uniqueNip29Rooms(cities:Nip29CityRoom[]):Nip29Room[]{
 const rooms=new Map<string,Nip29Room>();
 for(const city of cities){
  const destination=validNip29Destination(city.chat?.nip29);if(!destination)continue;
  const key=`${destination.relay}\n${destination.groupId}`,existing=rooms.get(key);
  if(existing){existing.cityIds.push(city.id);continue;}
  rooms.set(key,{key,label:city.chat.scope==="global"?"BitcoinWalk shared":city.name,scope:city.chat.scope,cityIds:[city.id],destination});
 }
 return [...rooms.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.key.localeCompare(b.key));
}

function exactTag(event:Event,name:string,value:string){const tags=event.tags.filter(tag=>tag[0]===name);return tags.length===1&&tags[0].length===2&&tags[0][1]===value;}

export function nip29RoomName(events:Event[],groupId:string,fallback:string):string{
 const metadata=events.filter(event=>event.kind===39000&&verifyEvent(event)&&exactTag(event,"d",groupId)).sort(compareEvents)[0];
 const name=metadata?.tags.find(tag=>tag[0]==="name"&&tag.length===2)?.[1]?.trim();
 return name&&name.length<=80?name:fallback;
}

export function mergeNip29Messages(current:Nip29Message[],events:Event[],groupId:string,now=Math.floor(Date.now()/1000)):Nip29Message[]{
 const rows=new Map(current.map(row=>[row.id,row]));
 for(const event of events){
  if(event.kind!==9||!verifyEvent(event)||!exactTag(event,"h",groupId)||!hex.test(event.pubkey)||event.created_at>now+60)continue;
  const content=event.content.trim();if(!content||content.length>4000)continue;
  rows.set(event.id,{id:event.id,pubkey:event.pubkey,content,createdAt:event.created_at});
 }
 return [...rows.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).slice(-200);
}

export function nip29JoinTemplate(groupId:string,now=Math.floor(Date.now()/1000)):EventTemplate{
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(groupId))throw new Error("Invalid community group.");
 return {kind:9021,created_at:now,tags:[["h",groupId]],content:""};
}

export function nip29MessageTemplate(groupId:string,content:string,now=Math.floor(Date.now()/1000)):EventTemplate{
 const clean=content.trim();if(!clean||clean.length>4000)throw new Error("Write a message of no more than 4,000 characters.");
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(groupId))throw new Error("Invalid community group.");
 return {kind:9,created_at:now,tags:[["h",groupId]],content:clean};
}
