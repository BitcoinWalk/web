import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event,EventTemplate} from "nostr-tools";
import {createCityDirectoryOwnerUpdate,parseCityDirectoryEvent,verifySignedCityDirectorySuccessor} from "../nostr/city-directory";

export type DirectorySuccessorRequestStatus="awaiting-owner"|"signed"|"rejected"|"superseded"|"expired";
export type DirectorySuccessorRequest={
 id:string;cityId:string;cityName:string;cityRevisionId:string;ownerPubkey:string;createdBy:string;
 rootEventId:string;initialOwnerPubkey:string;predecessorEvent:Event;status:DirectorySuccessorRequestStatus;
 eventCreatedAt:number;createdAt:number;expiresAt:number;updatedAt:number;template:EventTemplate;signedEvent:Event|null;
 classification:"owner-update-successor-rehearsal";
};
type Row=Omit<DirectorySuccessorRequest,"predecessorEvent"|"template"|"signedEvent"|"classification">&{predecessorEvent:string;template:string;signedEvent:string|null;classification:string};

function view(row:Row):DirectorySuccessorRequest{
 if(row.classification!=="owner-update-successor-rehearsal")throw new Error("Unknown directory successor request classification.");
 return {...row,predecessorEvent:JSON.parse(row.predecessorEvent),template:JSON.parse(row.template),signedEvent:row.signedEvent?JSON.parse(row.signedEvent):null,classification:row.classification};
}

export class DirectorySuccessorRequestStore{
 constructor(readonly db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
  db.exec(`CREATE TABLE IF NOT EXISTS city_directory_successor_request(
   id TEXT PRIMARY KEY,cityId TEXT NOT NULL,cityName TEXT NOT NULL,cityRevisionId TEXT NOT NULL,ownerPubkey TEXT NOT NULL,createdBy TEXT NOT NULL,
   rootEventId TEXT NOT NULL,initialOwnerPubkey TEXT NOT NULL,predecessorEvent TEXT NOT NULL,status TEXT NOT NULL,eventCreatedAt INTEGER NOT NULL,
   createdAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,template TEXT NOT NULL,signedEvent TEXT,classification TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS city_directory_successor_request_owner ON city_directory_successor_request(ownerPubkey,createdAt DESC);
   CREATE UNIQUE INDEX IF NOT EXISTS city_directory_successor_request_active ON city_directory_successor_request(cityId) WHERE status IN ('awaiting-owner','signed');`);
 }
 private expire(){const now=this.now();this.db.prepare("UPDATE city_directory_successor_request SET status='expired',updatedAt=? WHERE status='awaiting-owner' AND expiresAt<=?").run(now,now);}
 get(id:string){this.expire();const row=this.db.prepare("SELECT * FROM city_directory_successor_request WHERE id=?").get(id) as Row|undefined;return row?view(row):null;}
 list(actor:string,superAdmin:string){this.expire();const rows=(actor===superAdmin?this.db.prepare("SELECT * FROM city_directory_successor_request ORDER BY createdAt DESC").all():this.db.prepare("SELECT * FROM city_directory_successor_request WHERE ownerPubkey=? ORDER BY createdAt DESC").all(actor)) as Row[];return rows.map(view);}
 prepare(input:{cityId:string;cityName:string;cityRevisionId:string;ownerPubkey:string;createdBy:string;rootEventId:string;initialOwnerPubkey:string;predecessorEvent:Event;ttl?:number}){
  const now=this.now(),ttl=input.ttl??7*86400;if(ttl<300||ttl>30*86400)throw new Error("Directory successor request expiry is outside the allowed range.");
  const prior=parseCityDirectoryEvent(input.predecessorEvent);
  if(prior.cityId!==input.cityId||prior.ownerPubkey!==input.ownerPubkey)throw new Error("Directory successor predecessor does not match the approved city owner.");
  const active=this.db.prepare("SELECT id FROM city_directory_successor_request WHERE cityId=? AND status IN ('awaiting-owner','signed')").get(input.cityId) as {id:string}|undefined;
  if(active)throw new Error("This city already has an active directory successor request. Supersede it explicitly before preparing another.");
  const eventCreatedAt=Math.max(now,input.predecessorEvent.created_at+1);
  const template=createCityDirectoryOwnerUpdate(input.predecessorEvent,{signerPubkey:input.ownerPubkey,operatorPubkeys:prior.operatorPubkeys,recoveryPubkey:prior.recoveryPubkeys[0],primaryRelay:prior.publicRelays[0].url,mirrorRelays:prior.publicRelays.slice(1).map(relay=>relay.url)},eventCreatedAt);
  const request:DirectorySuccessorRequest={...input,id:randomUUID(),status:"awaiting-owner",eventCreatedAt,createdAt:now,expiresAt:now+ttl,updatedAt:now,template,signedEvent:null,classification:"owner-update-successor-rehearsal"};
  this.db.prepare("INSERT INTO city_directory_successor_request(id,cityId,cityName,cityRevisionId,ownerPubkey,createdBy,rootEventId,initialOwnerPubkey,predecessorEvent,status,eventCreatedAt,createdAt,expiresAt,updatedAt,template,signedEvent,classification) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(request.id,request.cityId,request.cityName,request.cityRevisionId,request.ownerPubkey,request.createdBy,request.rootEventId,request.initialOwnerPubkey,JSON.stringify(request.predecessorEvent),request.status,request.eventCreatedAt,request.createdAt,request.expiresAt,request.updatedAt,JSON.stringify(request.template),null,request.classification);
  return request;
 }
 sign(id:string,actor:string,event:Event){
  const request=this.get(id);if(!request)throw new Error("Directory successor request was not found.");
  if(request.ownerPubkey!==actor)throw new Error("Only the verified current city owner may sign this successor request.");
  const signed=verifySignedCityDirectorySuccessor(event,request.template,actor);
  if(request.status==="signed"){
   if(request.signedEvent?.id!==signed.id)throw new Error("This successor request is already signed with a different immutable event.");
   return request;
  }
  if(request.status!=="awaiting-owner")throw new Error(`Directory successor request is ${request.status} and cannot be signed.`);
  const now=this.now();this.db.prepare("UPDATE city_directory_successor_request SET status='signed',signedEvent=?,updatedAt=? WHERE id=? AND status='awaiting-owner'").run(JSON.stringify(signed),now,id);
  return this.get(id)!;
 }
 transition(id:string,actor:string,status:"rejected"|"superseded",superAdmin:string){
  const request=this.get(id);if(!request)throw new Error("Directory successor request was not found.");
  if(status==="rejected"&&actor!==request.ownerPubkey||status==="superseded"&&actor!==superAdmin)throw new Error("Directory successor request transition is not authorized.");
  if(request.status!=="awaiting-owner"&&request.status!=="signed")throw new Error(`Directory successor request is already ${request.status}.`);
  this.db.prepare("UPDATE city_directory_successor_request SET status=?,updatedAt=? WHERE id=?").run(status,this.now(),id);return this.get(id)!;
 }
}
