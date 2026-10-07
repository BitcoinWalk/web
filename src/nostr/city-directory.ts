import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {queryRelayEvents} from "./city-records";
import {publishVerifiedEvent,type RelayPublication} from "./relay";

export const CITY_DIRECTORY_KIND=30309;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hexKey=/^[0-9a-f]{64}$/;

export type CityPublicRelay={url:string;role:"primary"|"mirror"};
export type CityDirectoryAction="establish"|"update"|"rotate"|"recover";
export type CityDirectoryContent={version:1;cityId:string;sequence:number;action:CityDirectoryAction;previousEventId:string;ownerPubkey:string;operatorPubkeys:string[];recoveryPubkeys:[string];publicRelays:CityPublicRelay[]};
export type CityDirectoryRootInput={cityId:string;ownerPubkey:string;operatorPubkeys:string[];recoveryPubkey:string;primaryRelay:string;mirrorRelays:string[]};
export type CityDirectoryOwnerUpdateInput={signerPubkey:string;operatorPubkeys:string[];recoveryPubkey:string;primaryRelay:string;mirrorRelays:string[]};
export type CityDirectoryOperatorUpdateInput={signerPubkey:string;primaryRelay:string;mirrorRelays:string[]};
export type CityDirectoryOwnerChangeInput={signerPubkey:string;nextOwnerPubkey:string};
export type CityDirectoryAnchor={cityId:string;rootEventId:string;initialOwnerPubkey:string};
export type CityDirectoryState={currentEvent:Event;content:CityDirectoryContent;chainLength:number};
type Publish=(event:Event,relays:string[],minimumAcknowledgements:number)=>Promise<RelayPublication>;
type Read=(relay:string,event:Event)=>Promise<Event[]>;
type DiscoverRead=(relay:string,cityId:string)=>Promise<Event[]>;
export type CityDirectoryDiscovery={root:Event|null;reachableRelays:string[];unavailableRelays:string[]};

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

function publicRelays(primaryValue:string,mirrorValues:string[]):CityPublicRelay[]{
  const primary=normalizeRootWssRelay(primaryValue);
  const mirrors=mirrorValues.map(normalizeRootWssRelay).sort();
  const endpoints=[primary,...mirrors];
  if(endpoints.length>8)throw new Error("Use one primary and no more than seven public city mirrors.");
  if(new Set(endpoints).size!==endpoints.length)throw new Error("Public city relay URLs must be unique.");
  return [{url:primary,role:"primary"},...mirrors.map(url=>({url,role:"mirror" as const}))];
}

function directoryTags(content:CityDirectoryContent):string[][]{
  const tags:string[][]=[["d",content.cityId],["i",content.cityId],["sequence",String(content.sequence)],["action",content.action],["p",content.ownerPubkey,"","owner"]];
  if(content.previousEventId)tags.push(["e",content.previousEventId,"","directory-previous"]);
  for(const key of content.operatorPubkeys)tags.push(["p",key,"","operator"]);
  tags.push(["p",content.recoveryPubkeys[0],"","recovery"]);
  for(const endpoint of content.publicRelays)tags.push(["r",endpoint.url,endpoint.role]);
  return tags;
}

function directoryTemplate(content:CityDirectoryContent,createdAt:number):EventTemplate{
  return {kind:CITY_DIRECTORY_KIND,created_at:createdAt,tags:directoryTags(content),content:JSON.stringify(content)};
}

export function createCityDirectoryRoot(input:CityDirectoryRootInput,createdAt=Math.floor(Date.now()/1000)):EventTemplate{
  if(!uuid.test(input.cityId))throw new Error("City ID must be a canonical UUID.");
  const operatorPubkeys=normalizeKeys(input.ownerPubkey,input.operatorPubkeys,input.recoveryPubkey);
  const content:CityDirectoryContent={version:1,cityId:input.cityId,sequence:0,action:"establish",previousEventId:"",ownerPubkey:input.ownerPubkey,operatorPubkeys,recoveryPubkeys:[input.recoveryPubkey],publicRelays:publicRelays(input.primaryRelay,input.mirrorRelays)};
  return directoryTemplate(content,createdAt);
}

function exactKeys(value:Record<string,unknown>,keys:string[]){return Object.keys(value).sort().join("\0")===keys.slice().sort().join("\0");}
function canonicalTags(tags:string[][]){return tags.map(tag=>tag.join("\0")).sort();}

export function parseCityDirectoryEvent(event:Event):CityDirectoryContent{
  if(event.kind!==CITY_DIRECTORY_KIND||!verifyEvent(event))throw new Error("Invalid city directory event or signature.");
  let value:unknown;
  try{value=JSON.parse(event.content);}catch{throw new Error("Invalid city directory content.");}
  if(!value||typeof value!=="object"||Array.isArray(value)||!exactKeys(value as Record<string,unknown>,["version","cityId","sequence","action","previousEventId","ownerPubkey","operatorPubkeys","recoveryPubkeys","publicRelays"]))throw new Error("Invalid city directory content fields.");
  const content=value as Partial<CityDirectoryContent>;
  if(content.version!==1||typeof content.cityId!=="string"||!uuid.test(content.cityId)||!Number.isSafeInteger(content.sequence)||(content.sequence as number)<0||!["establish","update","rotate","recover"].includes(String(content.action))||typeof content.previousEventId!=="string"||typeof content.ownerPubkey!=="string"||!Array.isArray(content.operatorPubkeys)||!Array.isArray(content.recoveryPubkeys)||content.recoveryPubkeys.length!==1||!Array.isArray(content.publicRelays))throw new Error("Invalid city directory scope.");
  if(content.sequence===0?(content.action!=="establish"||content.previousEventId!==""):(content.action==="establish"||!hexKey.test(content.previousEventId)))throw new Error("Invalid city directory predecessor.");
  if(content.operatorPubkeys.some(key=>typeof key!=="string")||typeof content.recoveryPubkeys[0]!=="string")throw new Error("Invalid city directory authority.");
  const operatorPubkeys=normalizeKeys(content.ownerPubkey,content.operatorPubkeys as string[],content.recoveryPubkeys[0]);
  if(JSON.stringify(operatorPubkeys)!==JSON.stringify(content.operatorPubkeys))throw new Error("Directory operator keys must be sorted.");
  const relays=content.publicRelays as CityPublicRelay[];
  if(!relays.length||relays[0]?.role!=="primary"||relays.slice(1).some(relay=>relay?.role!=="mirror")||JSON.stringify(publicRelays(relays[0].url,relays.slice(1).map(relay=>relay.url)))!==JSON.stringify(relays))throw new Error("Invalid city directory endpoints.");
  const parsed=content as CityDirectoryContent;
  if(JSON.stringify(canonicalTags(event.tags))!==JSON.stringify(canonicalTags(directoryTags(parsed))))throw new Error("City directory tags do not match signed content.");
  return parsed;
}

function successor(previous:Event,content:Omit<CityDirectoryContent,"version"|"cityId"|"sequence"|"previousEventId">,createdAt:number):EventTemplate{
  const prior=parseCityDirectoryEvent(previous);
  if(createdAt<=previous.created_at)throw new Error("A directory successor must be created later than its predecessor.");
  return directoryTemplate({version:1,cityId:prior.cityId,sequence:prior.sequence+1,previousEventId:previous.id,...content},createdAt);
}

export function createCityDirectoryOwnerUpdate(previous:Event,input:CityDirectoryOwnerUpdateInput,createdAt=Math.max(Math.floor(Date.now()/1000),previous.created_at+1)):EventTemplate{
  const prior=parseCityDirectoryEvent(previous);
  if(input.signerPubkey!==prior.ownerPubkey)throw new Error("Only the current owner may change directory authorities.");
  const operatorPubkeys=normalizeKeys(prior.ownerPubkey,input.operatorPubkeys,input.recoveryPubkey);
  return successor(previous,{action:"update",ownerPubkey:prior.ownerPubkey,operatorPubkeys,recoveryPubkeys:[input.recoveryPubkey],publicRelays:publicRelays(input.primaryRelay,input.mirrorRelays)},createdAt);
}

export function createCityDirectoryOperatorUpdate(previous:Event,input:CityDirectoryOperatorUpdateInput,createdAt=Math.max(Math.floor(Date.now()/1000),previous.created_at+1)):EventTemplate{
  const prior=parseCityDirectoryEvent(previous);
  if(!prior.operatorPubkeys.includes(input.signerPubkey))throw new Error("The signer is not a listed operator for the current directory state.");
  return successor(previous,{action:"update",ownerPubkey:prior.ownerPubkey,operatorPubkeys:prior.operatorPubkeys,recoveryPubkeys:prior.recoveryPubkeys,publicRelays:publicRelays(input.primaryRelay,input.mirrorRelays)},createdAt);
}

export function createCityDirectoryRotation(previous:Event,input:CityDirectoryOwnerChangeInput,createdAt=Math.max(Math.floor(Date.now()/1000),previous.created_at+1)):EventTemplate{
  const prior=parseCityDirectoryEvent(previous);
  if(input.signerPubkey!==prior.ownerPubkey)throw new Error("Only the current owner may rotate directory ownership.");
  if(input.nextOwnerPubkey===prior.ownerPubkey)throw new Error("The rotated owner must be new.");
  normalizeKeys(input.nextOwnerPubkey,prior.operatorPubkeys,prior.recoveryPubkeys[0]);
  return successor(previous,{action:"rotate",ownerPubkey:input.nextOwnerPubkey,operatorPubkeys:prior.operatorPubkeys,recoveryPubkeys:prior.recoveryPubkeys,publicRelays:prior.publicRelays},createdAt);
}

export function createCityDirectoryRecovery(previous:Event,input:CityDirectoryOwnerChangeInput,createdAt=Math.max(Math.floor(Date.now()/1000),previous.created_at+1)):EventTemplate{
  const prior=parseCityDirectoryEvent(previous);
  if(!prior.recoveryPubkeys.includes(input.signerPubkey))throw new Error("The signer is not the declared recovery identity.");
  if(input.nextOwnerPubkey===prior.ownerPubkey)throw new Error("The recovered owner must be new.");
  normalizeKeys(input.nextOwnerPubkey,[],prior.recoveryPubkeys[0]);
  return successor(previous,{action:"recover",ownerPubkey:input.nextOwnerPubkey,operatorPubkeys:[],recoveryPubkeys:prior.recoveryPubkeys,publicRelays:prior.publicRelays},createdAt);
}

export function verifySignedCityDirectorySuccessor(event:Event,template:EventTemplate,signerPubkey:string):Event{
  if(event.pubkey!==signerPubkey)throw new Error("The directory successor must be signed by the required directory authority.");
  if(!verifyEvent(event))throw new Error("The signer returned an invalid directory signature.");
  if(event.kind!==template.kind||event.created_at!==template.created_at||event.content!==template.content||JSON.stringify(event.tags)!==JSON.stringify(template.tags))throw new Error("The signer did not return the exact directory successor that was reviewed.");
  return event;
}

function equalValues(left:unknown,right:unknown){return JSON.stringify(left)===JSON.stringify(right);}

function validateCityDirectoryTransition(previous:CityDirectoryContent,previousEvent:Event,next:CityDirectoryContent,nextEvent:Event){
  if(next.cityId!==previous.cityId||next.sequence!==previous.sequence+1||next.previousEventId!==previousEvent.id||nextEvent.created_at<=previousEvent.created_at)throw new Error("Invalid city directory chain order.");
  const signer=nextEvent.pubkey;
  if(next.action==="update"){
    if(next.ownerPubkey!==previous.ownerPubkey)throw new Error("A city directory update cannot rotate the owner.");
    if(signer===previous.ownerPubkey)return;
    if(!previous.operatorPubkeys.includes(signer)||!equalValues([next.ownerPubkey,next.operatorPubkeys,next.recoveryPubkeys],[previous.ownerPubkey,previous.operatorPubkeys,previous.recoveryPubkeys]))throw new Error("A city directory operator may change endpoints only.");
    return;
  }
  if(next.action==="rotate"){
    if(signer!==previous.ownerPubkey||next.ownerPubkey===previous.ownerPubkey||!equalValues(next.operatorPubkeys,previous.operatorPubkeys)||!equalValues(next.recoveryPubkeys,previous.recoveryPubkeys)||!equalValues(next.publicRelays,previous.publicRelays))throw new Error("Invalid city directory owner rotation.");
    return;
  }
  if(next.action==="recover"){
    if(!previous.recoveryPubkeys.includes(signer)||next.ownerPubkey===previous.ownerPubkey||next.operatorPubkeys.length!==0||!equalValues(next.recoveryPubkeys,previous.recoveryPubkeys)||!equalValues(next.publicRelays,previous.publicRelays))throw new Error("Invalid city directory recovery.");
    return;
  }
  throw new Error("Invalid city directory transition action.");
}

export function resolveCityDirectoryChain(events:Event[],anchor:CityDirectoryAnchor):CityDirectoryState{
  if(!uuid.test(anchor.cityId)||!hexKey.test(anchor.rootEventId)||!hexKey.test(anchor.initialOwnerPubkey))throw new Error("Invalid city directory anchor.");
  const byId=new Map<string,{event:Event;content:CityDirectoryContent}>(),children=new Map<string,{event:Event;content:CityDirectoryContent}[]>();
  for(const event of events){
    let content:CityDirectoryContent;
    try{content=parseCityDirectoryEvent(event);}catch(error){if(event.id===anchor.rootEventId)throw error;continue;}
    if(content.cityId!==anchor.cityId||byId.has(event.id))continue;
    const record={event,content};byId.set(event.id,record);
    if(content.previousEventId)children.set(content.previousEventId,[...(children.get(content.previousEventId)??[]),record]);
  }
  let current=byId.get(anchor.rootEventId);
  if(!current||current.content.sequence!==0||current.content.action!=="establish"||current.event.pubkey!==anchor.initialOwnerPubkey||current.content.ownerPubkey!==anchor.initialOwnerPubkey)throw new Error("Trusted city directory root unavailable.");
  let chainLength=1;
  for(;;){
    const candidates=[] as {event:Event;content:CityDirectoryContent}[];
    for(const candidate of children.get(current.event.id)??[]){
      const signer=candidate.event.pubkey;
      const authorized=candidate.content.action==="update"&&(signer===current.content.ownerPubkey||current.content.operatorPubkeys.includes(signer))||candidate.content.action==="rotate"&&signer===current.content.ownerPubkey||candidate.content.action==="recover"&&current.content.recoveryPubkeys.includes(signer);
      if(!authorized)continue;
      validateCityDirectoryTransition(current.content,current.event,candidate.content,candidate.event);
      candidates.push(candidate);
    }
    if(!candidates.length)break;
    if(candidates.length!==1)throw new Error("Found conflicting city directory successors; fail closed and audit them before continuing.");
    current=candidates[0];chainLength++;
    if(chainLength>1000)throw new Error("City directory chain limit exceeded.");
  }
  return {currentEvent:current.event,content:current.content,chainLength};
}

export async function discoverCityDirectoryChainForSigning(relayValues:string[],anchor:CityDirectoryAnchor,read:DiscoverRead=defaultDiscoverRead):Promise<{state:CityDirectoryState;relays:string[]}>{
  const relays=normalizeDirectoryRelays(relayValues);
  const outcomes=await Promise.allSettled(relays.map(relay=>read(relay,anchor.cityId)));
  const unavailable=relays.filter((_,index)=>outcomes[index].status==="rejected");
  if(unavailable.length)throw new Error(`Successor signing requires all configured directory transports. Unavailable: ${unavailable.join(", ")}`);
  const states=outcomes.map(outcome=>resolveCityDirectoryChain((outcome as PromiseFulfilledResult<Event[]>).value,anchor));
  if(states.some(state=>state.currentEvent.id!==states[0].currentEvent.id))throw new Error("Configured directory transports do not agree on the current signed event; fail closed and audit them before signing.");
  return {state:states[0],relays};
}

export function verifySignedCityDirectoryTemplate(event:Event,template:EventTemplate,ownerPubkey:string):Event{
  if(event.pubkey!==ownerPubkey)throw new Error("The directory root must be signed by the verified city owner.");
  if(!verifyEvent(event))throw new Error("The signer returned an invalid directory signature.");
  if(event.kind!==template.kind||event.created_at!==template.created_at||event.content!==template.content||JSON.stringify(event.tags)!==JSON.stringify(template.tags))throw new Error("The signer did not return the exact event that was reviewed.");
  return event;
}

function verifiedRoot(event:Event,cityId:string,ownerPubkey:string):Event|null{
  if(event.kind!==CITY_DIRECTORY_KIND||event.pubkey!==ownerPubkey||!verifyEvent(event))return null;
  try{
    const content=JSON.parse(event.content) as Partial<CityDirectoryContent>;
    if(content.version!==1||content.cityId!==cityId||content.sequence!==0||content.action!=="establish"||content.previousEventId!==""||content.ownerPubkey!==ownerPubkey||!Array.isArray(content.operatorPubkeys)||!Array.isArray(content.recoveryPubkeys)||content.recoveryPubkeys.length!==1||!Array.isArray(content.publicRelays)||!content.publicRelays.length)return null;
    const [primary,...mirrors]=content.publicRelays;
    if(primary?.role!=="primary"||mirrors.some(relay=>relay?.role!=="mirror"))return null;
    const template=createCityDirectoryRoot({cityId,ownerPubkey,operatorPubkeys:content.operatorPubkeys,recoveryPubkey:content.recoveryPubkeys[0],primaryRelay:primary.url,mirrorRelays:mirrors.map(relay=>relay.url)},event.created_at);
    return verifySignedCityDirectoryTemplate(event,template,ownerPubkey);
  }catch{return null;}
}

/** Recovers only one exact valid owner root. Outsider or malformed noise cannot
 * block establishment; two distinct valid owner roots are an actual conflict. */
export function selectExistingCityDirectoryRoot(events:Event[],cityId:string,ownerPubkey:string):Event|null{
  const roots=new Map<string,Event>();
  for(const event of events){const root=verifiedRoot(event,cityId,ownerPubkey);if(root)roots.set(root.id,root);}
  if(roots.size>1)throw new Error("Multiple conflicting owner-signed directory roots exist; fail closed and audit them before continuing.");
  return roots.values().next().value??null;
}

async function defaultDiscoverRead(relay:string,cityId:string){
  return queryRelayEvents([relay],[CITY_DIRECTORY_KIND],undefined,{"#i":[cityId],limit:20});
}

/** Read transports independently. One exact valid owner root is sufficient to
 * preserve discovery during an outage, but incomplete empty reads can never
 * authorize creation of a replacement root. Conflicting valid roots still fail
 * closed regardless of transport availability. */
export async function discoverExistingCityDirectoryRoot(relayValues:string[],cityId:string,ownerPubkey:string,read:DiscoverRead=defaultDiscoverRead):Promise<CityDirectoryDiscovery>{
  const relays=normalizeDirectoryRelays(relayValues);
  const outcomes=await Promise.allSettled(relays.map(relay=>read(relay,cityId)));
  const reachableRelays=relays.filter((_,index)=>outcomes[index].status==="fulfilled");
  const unavailableRelays=relays.filter((_,index)=>outcomes[index].status==="rejected");
  const events=outcomes.flatMap(outcome=>outcome.status==="fulfilled"?outcome.value:[]);
  const root=selectExistingCityDirectoryRoot(events,cityId,ownerPubkey);
  if(!root&&unavailableRelays.length)throw new Error(`Directory discovery is incomplete and cannot prove that no directory root exists. Unavailable: ${unavailableRelays.join(", ")}`);
  return {root,reachableRelays,unavailableRelays};
}

async function defaultRead(relay:string,event:Event){
  const cityId=event.tags.find(tag=>tag[0]==="i")?.[1];
  return queryRelayEvents([relay],[CITY_DIRECTORY_KIND],undefined,{ids:[event.id],...(cityId?{"#i":[cityId]}:{})});
}

export async function publishAndConfirmCityDirectoryRoot(event:Event,relayValues:string[],publish:Publish=publishVerifiedEvent,read:Read=defaultRead):Promise<{eventId:string;relays:string[]}>{
  const relays=normalizeDirectoryRelays(relayValues);
  await publish(event,relays,relays.length);
  return confirmCityDirectoryEvent(event,relays,read);
}

export async function confirmCityDirectoryEvent(event:Event,relayValues:string[],read:Read=defaultRead):Promise<{eventId:string;relays:string[]}>{
  const relays=normalizeDirectoryRelays(relayValues);
  const outcomes=await Promise.all(relays.map(async relay=>({relay,events:await read(relay,event)})));
  const missing=outcomes.filter(({events})=>!events.some(candidate=>candidate.id===event.id&&verifyEvent(candidate))).map(({relay})=>relay);
  if(missing.length)throw new Error(`The exact signed directory event could not be read back independently from: ${missing.join(", ")}`);
  return {eventId:event.id,relays};
}
