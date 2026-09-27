import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {queryRelayEvents} from "./city-records";
import {publishVerifiedEvent,type RelayPublication} from "./relay";

export const CITY_DIRECTORY_KIND=30309;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hexKey=/^[0-9a-f]{64}$/;

export type CityPublicRelay={url:string;role:"primary"|"mirror"};
export type CityDirectoryContent={version:1;cityId:string;sequence:0;action:"establish";previousEventId:"";ownerPubkey:string;operatorPubkeys:string[];recoveryPubkeys:[string];publicRelays:CityPublicRelay[]};
export type CityDirectoryRootInput={cityId:string;ownerPubkey:string;operatorPubkeys:string[];recoveryPubkey:string;primaryRelay:string;mirrorRelays:string[]};
type Publish=(event:Event,relays:string[],minimumAcknowledgements:number)=>Promise<RelayPublication>;
type Read=(relay:string,event:Event)=>Promise<Event[]>;

export function normalizeRootWssRelay(value:string):string{
  let url:URL;
  try{url=new URL(value.trim());}catch{throw new Error("Relay endpoint must be a valid WSS URL.");}
  if(url.protocol!=="wss:"||!url.hostname||url.username||url.password||url.search||url.hash)throw new Error("Relay endpoint must be a public WSS URL without credentials, query or fragment.");
  if(url.pathname!=="/"&&url.pathname!=="")throw new Error("Relay endpoint must use the relay root, without a path.");
  url.pathname="/";
  return url.toString();
}

export function normalizeDirectoryRelays(values:string[]):string[]{
  const relays=values.map(normalizeRootWssRelay);
  if(relays.length<2||relays.length>8)throw new Error("Configure two to eight independent directory discovery relays.");
  if(new Set(relays).size!==relays.length)throw new Error("Directory discovery relay URLs must be unique.");
  return relays;
}

function normalizeKeys(owner:string,operators:string[],recovery:string){
  const values=[owner,...operators,recovery];
  if(values.some(value=>!hexKey.test(value)))throw new Error("Directory authority keys must be lowercase 32-byte hex public keys.");
  if(operators.length>20)throw new Error("Use no more than 20 directory operator keys.");
  if(new Set(values).size!==values.length)throw new Error("Owner, operator and recovery keys must be distinct.");
  return [...operators].sort();
}

export function createCityDirectoryRoot(input:CityDirectoryRootInput,createdAt=Math.floor(Date.now()/1000)):EventTemplate{
  if(!uuid.test(input.cityId))throw new Error("City ID must be a canonical UUID.");
  const operatorPubkeys=normalizeKeys(input.ownerPubkey,input.operatorPubkeys,input.recoveryPubkey);
  const primary=normalizeRootWssRelay(input.primaryRelay);
  const mirrors=input.mirrorRelays.map(normalizeRootWssRelay).sort();
  const endpoints=[primary,...mirrors];
  if(endpoints.length>8)throw new Error("Use one primary and no more than seven public city mirrors.");
  if(new Set(endpoints).size!==endpoints.length)throw new Error("Public city relay URLs must be unique.");
  const publicRelays:CityPublicRelay[]=[{url:primary,role:"primary"},...mirrors.map(url=>({url,role:"mirror" as const}))];
  const content:CityDirectoryContent={version:1,cityId:input.cityId,sequence:0,action:"establish",previousEventId:"",ownerPubkey:input.ownerPubkey,operatorPubkeys,recoveryPubkeys:[input.recoveryPubkey],publicRelays};
  const tags:string[][]=[["d",content.cityId],["i",content.cityId],["sequence","0"],["action","establish"],["p",content.ownerPubkey,"","owner"]];
  for(const key of content.operatorPubkeys)tags.push(["p",key,"","operator"]);
  tags.push(["p",content.recoveryPubkeys[0],"","recovery"]);
  for(const endpoint of content.publicRelays)tags.push(["r",endpoint.url,endpoint.role]);
  return {kind:CITY_DIRECTORY_KIND,created_at:createdAt,tags,content:JSON.stringify(content)};
}

export function verifySignedCityDirectoryTemplate(event:Event,template:EventTemplate,ownerPubkey:string):Event{
  if(event.pubkey!==ownerPubkey)throw new Error("The directory root must be signed by the verified city owner.");
  if(!verifyEvent(event))throw new Error("The signer returned an invalid directory signature.");
  if(event.kind!==template.kind||event.created_at!==template.created_at||event.content!==template.content||JSON.stringify(event.tags)!==JSON.stringify(template.tags))throw new Error("The signer did not return the exact event that was reviewed.");
  return event;
}

async function defaultRead(relay:string,event:Event){
  const cityId=event.tags.find(tag=>tag[0]==="i")?.[1];
  return queryRelayEvents([relay],[CITY_DIRECTORY_KIND],undefined,{ids:[event.id],...(cityId?{"#i":[cityId]}:{})});
}

export async function publishAndConfirmCityDirectoryRoot(event:Event,relayValues:string[],publish:Publish=publishVerifiedEvent,read:Read=defaultRead):Promise<{eventId:string;relays:string[]}>{
  const relays=normalizeDirectoryRelays(relayValues);
  await publish(event,relays,relays.length);
  const outcomes=await Promise.all(relays.map(async relay=>({relay,events:await read(relay,event)})));
  const missing=outcomes.filter(({events})=>!events.some(candidate=>candidate.id===event.id&&verifyEvent(candidate))).map(({relay})=>relay);
  if(missing.length)throw new Error(`The exact signed directory event could not be read back independently from: ${missing.join(", ")}`);
  return {eventId:event.id,relays};
}
