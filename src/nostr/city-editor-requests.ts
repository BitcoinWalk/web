import {compareEvents,nip19,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {cityOwnerPubkey} from "../domain/city";
import type {AuthorizationRecord} from "./city-records";
import {queryRelayEvents} from "./city-records";

export const CITY_EDITOR_REQUEST_KIND=30314;
const requestSchema=z.object({
  version:z.literal(1),
  cityId:z.string().uuid(),
  action:z.enum(["add","remove"]),
  editorPubkey:z.string().regex(/^[0-9a-f]{64}$/),
  authorizationEventId:z.string().regex(/^[0-9a-f]{64}$/),
});
export type CityEditorRequest=z.infer<typeof requestSchema>;
export type CityEditorRequestRecord={event:Event;request:CityEditorRequest};

const one=(event:Event,name:string,value:string)=>event.tags.filter(tag=>tag[0]===name&&tag.length===2&&tag[1]===value).length===1&&event.tags.filter(tag=>tag[0]===name).length===1;
const reference=(event:Event,id:string)=>event.tags.filter(tag=>tag[0]==="e"&&tag.length===4&&tag[1]===id&&tag[2]===""&&tag[3]==="current-authorization").length===1&&event.tags.filter(tag=>tag[0]==="e").length===1;

export function editorRequestPublicKey(input:string):string{
  const value=input.trim();
  if(!value.startsWith("npub1"))throw new Error("Enter a public npub identity, never a private key.");
  try{const decoded=nip19.decode(value);if(decoded.type==="npub")return decoded.data;}catch{/* handled below */}
  throw new Error("That npub is not valid. Check the full public identity.");
}

export function createCityEditorRequest(record:AuthorizationRecord,actor:string,action:"add"|"remove",editorPubkey:string,now=Math.floor(Date.now()/1000)):EventTemplate{
  const owner=cityOwnerPubkey(record.grant),exists=record.grant.editorPubkeys.includes(editorPubkey);
  if(actor!==owner)throw new Error("Only the current city owner can request editor changes.");
  if(!/^[0-9a-f]{64}$/.test(editorPubkey))throw new Error("Invalid editor public key.");
  if(editorPubkey===owner)throw new Error("The city owner must remain an editor.");
  if(action==="add"&&exists)throw new Error("This identity is already a city editor.");
  if(action==="remove"&&!exists)throw new Error("This identity is not a city editor.");
  if(action==="add"&&record.grant.editorPubkeys.length>=100)throw new Error("This city already has the maximum number of editors.");
  const request=requestSchema.parse({version:1,cityId:record.grant.cityId,action,editorPubkey,authorizationEventId:record.event.id});
  return {kind:CITY_EDITOR_REQUEST_KIND,created_at:now,content:JSON.stringify(request),tags:[["d",`${request.cityId}:${crypto.randomUUID()}`],["i",request.cityId],["p",request.editorPubkey],["e",request.authorizationEventId,"","current-authorization"],["action",request.action],["client","bitcoinwalk.org"]]};
}

export function parseCityEditorRequest(event:Event):CityEditorRequestRecord|null{
  if(event.kind!==CITY_EDITOR_REQUEST_KIND||!verifyEvent(event))return null;
  try{
    const request=requestSchema.parse(JSON.parse(event.content));
    const d=event.tags.filter(tag=>tag[0]==="d"&&tag.length===2);
    if(d.length!==1||!d[0][1]?.startsWith(`${request.cityId}:`)||!one(event,"i",request.cityId)||!one(event,"p",request.editorPubkey)||!one(event,"action",request.action)||!reference(event,request.authorizationEventId))return null;
    return {event,request};
  }catch{return null;}
}

export async function queryCityEditorRequests(relays:string[],cityIds?:string[]):Promise<CityEditorRequestRecord[]>{
  if(cityIds&&!cityIds.length)return [];
  const events=await queryRelayEvents(relays,[CITY_EDITOR_REQUEST_KIND],undefined,{...(cityIds?{"#i":cityIds}:{}),limit:500});
  if(events.length>=500)throw new Error("City editor requests reached the read limit. Narrow the city selection before approving changes.");
  return events.map(parseCityEditorRequest).filter((row):row is CityEditorRequestRecord=>row!==null).sort((a,b)=>compareEvents(a.event,b.event));
}

export function pendingCityEditorRequests(requests:CityEditorRequestRecord[],grants:AuthorizationRecord[]):CityEditorRequestRecord[]{
  const current=new Map(grants.map(record=>[record.grant.cityId,record])),latest=new Map<string,CityEditorRequestRecord>();
  for(const row of [...requests].sort((a,b)=>compareEvents(a.event,b.event))){
    const grant=current.get(row.request.cityId);
    if(!grant||grant.event.id!==row.request.authorizationEventId||row.event.pubkey!==cityOwnerPubkey(grant.grant))continue;
    const exists=grant.grant.editorPubkeys.includes(row.request.editorPubkey);
    if(row.request.action==="add"?exists:!exists)continue;
    latest.set(`${row.request.cityId}:${row.request.editorPubkey}`,row);
  }
  return [...latest.values()];
}

export function assertCityEditorRequestSignature(event:Event,template:EventTemplate,actor:string){
  if(event.pubkey!==actor||event.kind!==template.kind||event.created_at!==template.created_at||event.content!==template.content||JSON.stringify(event.tags)!==JSON.stringify(template.tags))throw new Error("The signer returned a different account or editor request. Nothing was published.");
}
